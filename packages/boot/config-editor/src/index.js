/**
 * Persistent edits to one profile's own patch layer, applied to the live tree.
 *
 * `cordis.patch.yml` is the layer a person owns, so an edit is written there as
 * one id-targeted row and then applied through the same Loader path a file
 * change takes. The entry's own fiber validates the value first, the write is
 * atomic under the profile's file lock, and HMR reloads are held back for the
 * whole transaction.
 * @module @freddie/freddie-config-editor
 */

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

/** The YAML tag freddie resolves against the loader context at mount time. */
const JS_TAG = 'tag:yaml.org,2002:js'

/** An absent patch document is an empty row list, which is what a new profile ships. */
const EMPTY_DOCUMENT = '[]\n'

/**
 * Parse a patch document with freddie's own entry-list dialect, so `!!js`
 * fields and row validation match what the Include will mount.
 * @param source - document text.
 * @returns the row list.
 * @throws when the document is not a sequence of patch rows.
 */
export function readRows(source) {
  const rows = load(source, { schema: entryListSchema })
  if (!Array.isArray(rows)) {
    throw new Error('config-editor: profile patch must be a YAML sequence of rows')
  }
  return rows
}

/**
 * Set row fields on the last row of a patch document that addresses one entry,
 * leaving every other node — and its comments — as it was.
 * @param source - current document text.
 * @param target - `id` and optional `name` addressing the row.
 * @param fields - row fields to set; every value is written as given.
 * @returns the next document text, or `undefined` when the write changes nothing.
 */
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

/** Writes one profile's own patch layer and applies each edit to the live tree. */
export class ConfigEditor extends Service {
  static inject = ['loader']

  static Config = z.object({
    profile: z.string(),
  })

  constructor(ctx, config) {
    super(ctx, 'configEditor')
    this.config = config
  }

  /** The patch file this service writes. */
  get documentPath() {
    return join(resolveProfileDir(this.config.profile), PROFILE_PATCH_FILENAME)
  }

  /**
   * Entries the profile layer can address. Rows are id-targeted, so an id the
   * tree mounts more than once has no unambiguous target.
   * @returns active entries mounted by the profile's root include, uniquely addressed.
   */
  entries() {
    const candidates = [...this.ctx.loader.entries()]
      .filter(entry => entry.parent.tree.ctx.fiber.entry?.id === 'include')
    const counts = new Map()
    for (const entry of candidates) {
      counts.set(entry.options.id, (counts.get(entry.options.id) ?? 0) + 1)
    }
    return candidates.filter(entry => counts.get(entry.options.id) === 1)
  }

  /**
   * The patch layer's own rows, read fresh per call: another writer (a person,
   * or another process) can change this file at any time.
   * @returns the document text and its parsed rows.
   */
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

  /**
   * Effective configuration and the profile layer's own override, per
   * addressable entry.
   * @returns detached values alongside their Loader entries.
   */
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

  /**
   * Validate, persist, and apply one entry's complete configuration.
   * @param entry - the entry to configure; also proves it was not replaced mid-write.
   * @param change - derive the next raw config from the entry's effective config
   *   and the override this write replaces.
   * @returns fulfillment after the Loader has applied the new configuration.
   */
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

  /**
   * Persist and apply the `disabled` state of one entry. The value is written
   * explicitly rather than cleared: a row carrying `disabled: false` is how a
   * profile turns a bundle's disabled row back on.
   * @param entry - the entry to switch.
   * @param disabled - the state to persist.
   * @returns fulfillment after the Loader has applied the new state.
   */
  async setDisabled(entry, disabled) {
    return await this.write(entry, async () => ({
      fields: { disabled },
      apply: () => entry.update({ disabled }),
    }))
  }

  /**
   * One profile-patch transaction: write the row, then apply it, and restore
   * the previous document if the apply rejects. HMR holds its reloads for the
   * whole transaction, so a debounced reload cannot dispose the fibers the
   * apply just restarted. The profile lock is the same one the CLI takes when
   * it reconciles installed bundles, so an install cannot interleave with an
   * edit of the rows it rewrites.
   * @param entry - the entry the row addresses.
   * @param prepare - derive the row fields and the apply step from the override
   *   this write replaces.
   * @returns fulfillment after the Loader has applied the change.
   */
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
