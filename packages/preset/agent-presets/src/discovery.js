import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { dump, load } from 'js-yaml'
import { entryListSchema } from '@freddie/cordis-plugin-include'
import { expandHomePath } from '@freddie/freddie-home-paths'
import { readPresetMetadata } from './metadata.js'
import { PRESET_ID } from './preset.js'

export const COMPOSITION_FILE = 'agent.cordis.yml'

export const USER_PRESET_DIR = '.agent-presets'

export function entryListProblem(rows, at = '') {
  if (!Array.isArray(rows)) {
    return at === ''
      ? 'the composition must be a top-level list of plugin rows'
      : `group ${at} must hold a list of plugin rows`
  }
  for (const [index, row] of rows.entries()) {
    const label = at === '' ? `row ${String(index + 1)}` : `${at} row ${String(index + 1)}`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return `${label} is not a plugin row (expected a map with a "name")`
    }
    const { name, group, config } = row
    if (typeof name !== 'string' || name === '') {
      return `${label} names no plugin (a "name" string is required)`
    }
    if (group === true) {
      const nested = entryListProblem(config, label)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

async function compositionProblem(path) {
  let content
  try {
    content = await readFile(path, 'utf8')
  } catch {
    return `the composition file ${COMPOSITION_FILE} cannot be read`
  }
  let rows
  try {
    rows = load(content, { schema: entryListSchema })
  } catch (error) {
    /* v8 ignore next */
    const full = error instanceof Error ? error.message : String(error)
    return `the composition is not valid YAML: ${full.replace(/\n[\s\S]*$/, '')}`
  }
  return entryListProblem(rows)
}

export function renderComposition(rows) {
  return dump(rows, { schema: entryListSchema, noRefs: true, lineWidth: -1 })
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

export async function scanRoot(root) {
  const dir = resolve(expandHomePath(root.path))
  let children
  try {
    children = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new Error(`agent-presets: cannot read preset root ${dir}: ${String(error)}`, { cause: error })
  }
  const found = []
  for (const child of children) {
    if (!child.isDirectory() || !PRESET_ID.test(child.name)) continue
    const directory = join(dir, child.name)
    const path = join(directory, COMPOSITION_FILE)
    const broken = await isFile(path)
      ? await compositionProblem(path)
      : `the composition file ${COMPOSITION_FILE} is missing — the directory still occupies the id; delete it or restore the file`
    const metadata = await readPresetMetadata(directory)
    found.push({
      id: child.name, trust: root.trust, path, ...metadata,
      ...broken === undefined ? {} : { broken },
    })
  }
  return found.sort((left, right) => {
    const byOrder = (left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY)
    return byOrder === 0 ? left.id.localeCompare(right.id) : byOrder
  })
}

export async function discoverPresets(roots) {
  const byId = new Map()
  for (const root of roots) {
    for (const preset of await scanRoot(root)) {
      if (byId.has(preset.id)) continue
      byId.set(preset.id, preset)
    }
  }
  return [...byId.values()]
}
