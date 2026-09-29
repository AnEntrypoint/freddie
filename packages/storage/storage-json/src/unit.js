import { readFile } from 'node:fs/promises'
import { StorageError } from '@freddie/freddie-storage'
import { writeAtomic } from './atomic.js'
import { parse, serialize } from './format.js'

export async function openJsonUnit(descriptor, path, onClose) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const state =
    text === undefined
      ? {
        version: descriptor.version,
        global: null,
        tables: new Map(descriptor.tables.map(table => [table, new Map()])),
      }
      : parse(text, descriptor)
  return new JsonKvUnit(descriptor, path, state, onClose)
}

class JsonKvUnit {
  closed = false
  inFlight = new Set()

  constructor(descriptor, path, state, onClose) {
    this.descriptor = descriptor
    this.path = path
    this.state = state
    this.onClose = onClose
  }

  // oxlint-disable-next-line typescript/require-await -- async keeps the closed guard a rejection, not a synchronous throw
  async loadAll() {
    this.assertOpen()
    const tables = {}
    for (const [table, records] of this.state.tables) {
      tables[table] = Object.fromEntries(records)
    }
    return { tables, global: this.state.global }
  }

  async putRecord(table, key, value) {
    this.assertOpen()
    const records = this.records(table)
    const hadKey = records.has(key)
    const previous = records.get(key)
    records.set(key, value)
    await this.publish().catch((error) => {
      if (hadKey) records.set(key, previous)
      else records.delete(key)
      throw error
    })
  }

  async deleteRecord(table, key) {
    this.assertOpen()
    const records = this.records(table)
    if (!records.has(key)) return
    const previous = records.get(key)
    records.delete(key)
    await this.publish().catch((error) => {
      records.set(key, previous)
      throw error
    })
  }

  async setGlobal(value) {
    this.assertOpen()
    if (!this.descriptor.hasGlobal) {
      throw new Error(`unit '${this.descriptor.name}' does not declare a global slot`)
    }
    const previous = this.state.global
    this.state.global = value
    await this.publish().catch((error) => {
      this.state.global = previous
      throw error
    })
  }

  async close() {
    if (this.closed) {
      await Promise.allSettled(this.inFlight)
      return
    }
    this.closed = true
    await Promise.allSettled(this.inFlight)
    this.onClose()
  }

  assertOpen() {
    if (this.closed) {
      throw new StorageError('closed', `unit '${this.descriptor.name}' is closed`)
    }
  }

  records(table) {
    const records = this.state.tables.get(table)
    if (!records) {
      throw new Error(`unit '${this.descriptor.name}' does not declare table '${table}'`)
    }
    return records
  }

  publish() {
    const write = writeAtomic(this.path, serialize(this.descriptor.name, this.state))
    this.inFlight.add(write)
    write.catch(() => {}).finally(() => this.inFlight.delete(write))
    return write
  }
}
