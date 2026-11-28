import { mkdir } from '@freddie/freddie-runtime/fs-promises'
import { join } from '@freddie/freddie-runtime/path'
import { UNIT_NAME_RE } from './backend.js'
import { StorageError } from './error.js'
import { openJsonUnit } from './unit.js'

export class JsonStorageBackend {
  open = new Map()
  opening = new Map()
  closed = false

  constructor(root) {
    this.root = root
    this.kv = {
      open: async (descriptor) => {
        if (this.closed) throw new StorageError('closed', 'json backend is closed')
        validateDescriptor(descriptor)
        if (this.open.has(descriptor.name) || this.opening.has(descriptor.name)) {
          throw new Error(`unit '${descriptor.name}' is already open; a unit has exactly one live handle`)
        }
        const opening = this.openUnit(descriptor)
        this.opening.set(descriptor.name, opening)
        return opening.finally(() => this.opening.delete(descriptor.name))
      },
    }
  }

  async openUnit(descriptor) {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const path = join(this.root, `${descriptor.name}.json`)
    const unit = await openJsonUnit(descriptor, path, () => this.open.delete(descriptor.name))
    if (this.closed) {
      await unit.close()
      throw new StorageError('closed', 'json backend is closed')
    }
    this.open.set(descriptor.name, unit)
    return unit
  }

  async close() {
    if (!this.closed) {
      this.closed = true
    }
    await Promise.allSettled([...this.opening.values()])
    for (const unit of [...this.open.values()]) {
      await unit.close()
    }
  }
}

function validateDescriptor(descriptor) {
  if (!UNIT_NAME_RE.test(descriptor.name)) {
    throw new StorageError('malformed-medium', `invalid unit name '${descriptor.name}'`)
  }
  for (const table of descriptor.tables) {
    if (!UNIT_NAME_RE.test(table)) {
      throw new StorageError('malformed-medium', `invalid table name '${table}' in unit '${descriptor.name}'`)
    }
  }
}
