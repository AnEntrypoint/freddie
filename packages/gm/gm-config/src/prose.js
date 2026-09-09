/**
  * Read-only prose / gate / residual resolution. First non-empty wins:
  * project `.gm/instructions/<key>.md`, then `<cacheDir>/<dir>/<stem>.md`.
  * Never invents compiled-default prose (that text is baked into gm.wasm).
  * @module @freddie/freddie-gm-config/src/prose
  */

import { readText } from './fs.js'
import { joinRel, pathContainedWithin, validateProseKey, validateSourcePath } from './path.js'
import { resolve } from './resolve.js'
import { stripBom } from './parse.js'

const LOCAL_BASE = '.gm/instructions'
const MESSAGE_NAMESPACES = [
  ['gates/', 'gates_dir'],
  ['residual/', 'residual_dir'],
]

function readClean(path) {
  const raw = readText(path)
  if (raw === undefined) return undefined
  const text = stripBom(raw).replaceAll('\r\n', '\n')
  if (text.trim() === '') return undefined
  return text
}

function instructionsLocation(config, key) {
  const dir = config?.instructions?.dir
  return {
    dir: typeof dir === 'string' ? dir : 'prose',
    stem: key,
    declaringField: 'instructions.dir',
  }
}

function messageLocation(config, key) {
  const messages = config?.messages
  if (messages === undefined || typeof messages !== 'object' || messages === null) return undefined
  for (const [namespace, field] of MESSAGE_NAMESPACES) {
    if (!key.startsWith(namespace)) continue
    const stem = key.slice(namespace.length)
    if (stem === '') return undefined
    const dir = messages[field]
    if (typeof dir !== 'string') return undefined
    return { dir, stem, declaringField: `messages.${field}` }
  }
  return undefined
}

function readFromCacheRoot(cache, config, key) {
  const loc = messageLocation(config, key) ?? instructionsLocation(config, key)
  const pathErr = validateSourcePath(loc.dir)
  if (pathErr !== undefined) {
    return { tier: 'broken', reason: `${cache}/gm.config.json: ${loc.declaringField} is not a safe relative path` }
  }
  const trimmed = loc.dir.trim().replace(/^\/+|\/+$/g, '')
  const full = trimmed === '' ? `${cache}/${loc.stem}.md` : `${cache}/${trimmed}/${loc.stem}.md`
  if (!pathContainedWithin(cache, full)) {
    return { tier: 'broken', reason: `${cache}/gm.config.json: ${loc.declaringField} resolves to ${full}, which escapes ${cache}` }
  }
  const text = readClean(full)
  if (text !== undefined) return { tier: 'source_repo', text, path: full }
  return { tier: 'miss', path: full }
}

/**
  * Resolve one prose/gate/residual key against project overrides then the winning cache.
  * @param projectRoot - project directory.
  * @param key - e.g. `entry`, `gates/dirty-tree`, `residual/prd-open`.
  * @returns `{ tier, text?, path?, reason? }`.
  */
export function resolveProse(projectRoot, key) {
  const keyErr = validateProseKey(key)
  if (keyErr !== undefined) return { tier: 'broken', reason: keyErr }
  const localPath = joinRel(projectRoot, `${LOCAL_BASE}/${key}.md`)
  if (!pathContainedWithin(joinRel(projectRoot, LOCAL_BASE), localPath)) {
    return { tier: 'broken', reason: `prose key resolves to ${localPath}, which escapes ${LOCAL_BASE}` }
  }
  const local = readClean(localPath)
  if (local !== undefined) return { tier: 'local_override', text: local, path: localPath }

  const resolution = resolve(projectRoot)
  if (resolution.cacheDir === undefined) {
    return { tier: 'miss', reason: resolution.why }
  }
  return readFromCacheRoot(resolution.cacheDir, resolution.config, key)
}
