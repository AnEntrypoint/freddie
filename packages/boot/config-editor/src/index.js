import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { FiberState, Service, resolveConfig } from '@freddie/cordis'
import { entryListSchema } from '@freddie/cordis-plugin-include'
import { PROFILE_PATCH_FILENAME, resolveProfileDir } from '@freddie/freddie-app-boot'
import { withFileLock, writeFileAtomic } from '@freddie/freddie-atomic-write'
import { load } from 'js-yaml'
import { isMap, isSeq, parseDocument, Scalar, visit } from 'yaml'
import z from '@freddie/schemastery'

const JS_TAG = 'tag:yaml.org,2002:js'

const EMPTY_DOCUMENT = '[]\n'

export function readRows(source) {
  const rows = load(source, { schema: entryListSchema })
  if (!Array.isArray(rows)) {
    throw new Error('config-editor: profile patch must be a YAML sequence of rows')
  }
  return rows
}

export function setEntryFields(source, target, fields) {
  const document = parseDocument(source, {
    customTags: [{ tag: JS_TAG, resolve: value => value }],
  })
  if (document.errors[0] !== undefined) throw document.errors[0]
  if (!isSeq(document.contents)) {
    throw new Error('config-editor: profile patch must be a YAML sequence of rows')
  }
  document.contents.flow = false
  const rows = document.contents.items
  let index = -1
  for (let cursor = rows.length - 1; cursor >= 0; cursor--) {
    const row = rows[cursor]
    if (!isMap(row) || row.has('insert')) continue
    if (document.getIn([cursor, 'id']) !== target.id) continue
    if (row.has('name') && document.getIn([cursor, 'name']) !== target.name) continue
    index = cursor
    break
  }
  const rowAlreadyHoldsEveryField = index !== -1 && Object.entries(fields)
    .every(([key, value]) => isDeepStrictEqual(document.getIn([index, key]), value))
  if (rowAlreadyHoldsEveryField) return undefined
  if (index === -1) {
    document.add(document.createNode({
      id: target.id,
      ...(target.name === undefined ? {} : { name: target.name }),
      ...fields,
    }))
  } else {
    for (const [key, value] of Object.entries(fields)) {
      document.setIn([index, key], document.createNode(value))
    }
  }
  visit(document, {
    Map(_key, node) {
      if (node.items.length !== 1 || typeof node.get('__jsExpr') !== 'string') return
      const expression = new Scalar(node.get('__jsExpr'))
      expression.tag = JS_TAG
      return expression
    },
  })
  return String(document)
}

export class ConfigEditor extends Service {
  static inject = ['loader']

  static Config = z.object({
    profile: z.string(),
  })

  constructor(ctx, config) {
    super(ctx, 'configEditor')
    this.config = config
  }

  get documentPath() {
    return join(resolveProfileDir(this.config.profile), PROFILE_PATCH_FILENAME)
  }

  entries() {
    const candidates = [...this.ctx.loader.entries()]
      .filter(entry => entry.parent.tree.ctx.fiber.entry?.id === 'include')
    const counts = new Map()
    for (const entry of candidates) {
      counts.set(entry.options.id, (counts.get(entry.options.id) ?? 0) + 1)
    }
    return candidates.filter(entry => counts.get(entry.options.id) === 1)
  }

  async document() {
    let source
    try {
      source = await readFile(this.documentPath, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      source = EMPTY_DOCUMENT
    }
    return { source, rows: readRows(source) }
  }

  async configuration() {
    const { rows } = await this.document()
    return this.entries().map(entry => ({
      entry,
      current: structuredClone(entry.options.config ?? {}),
      override: structuredClone(
        rows.findLast(row => row.id === entry.options.id && row.config !== undefined)?.config ?? {},
      ),
    }))
  }

  async edit(entry, change) {
    return await this.write(entry, async (override) => {
      const fiber = entry.fiber
      if (fiber === undefined || fiber.state !== FiberState.ACTIVE) {
        throw new Error('config-editor: entry has no active fiber to validate the configuration')
      }
      const current = structuredClone(entry.options.config ?? {})
      const next = change(current, override)
      const resolved = fiber.ctx.waterfall(fiber, 'internal/config', next, () => next)
      resolveConfig(fiber.runtime, resolved)
      return { fields: { config: next }, apply: () => entry.update({ config: next }) }
    })
  }

  async setDisabled(entry, disabled) {
    return await this.write(entry, async () => ({
      fields: { disabled },
      apply: () => entry.update({ disabled }),
    }))
  }

  async write(entry, prepare) {
    const run = async () => {
      const path = this.documentPath
      await withFileLock(join(dirname(path), 'package.json'), async () => {
        if (!this.entries().includes(entry)) {
          throw new Error('config-editor: entry is not addressable from the profile patch')
        }
        const { source, rows } = await this.document()
        const override = structuredClone(
          rows.findLast(row => row.id === entry.options.id && row.config !== undefined)?.config ?? {},
        )
        const { fields, apply } = await prepare(override)
        const next = setEntryFields(source, { id: entry.options.id, name: entry.options.name }, fields)
        if (next === undefined) return
        await writeFileAtomic(path, next, { mode: 0o600 })
        try {
          await apply()
        } catch (error) {
          await writeFileAtomic(path, source, { mode: 0o600 })
          throw error
        }
      })
    }
    const hmr = this.ctx.get('hmr')
    await (hmr === undefined ? run() : hmr.runExclusive(run))
  }
}

export default ConfigEditor
