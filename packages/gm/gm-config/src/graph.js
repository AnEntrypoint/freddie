import { readText } from './fs.js'
import { joinRel, pathContainedWithin, validateSourcePath } from './path.js'
import { resolve } from './resolve.js'
import { stripBom } from './parse.js'

const GRAPH_OVERRIDE_REL = '.gm/instructions/fsm/graph.json'

function parseGraph(raw, path) {
  const cleaned = stripBom(raw)
  if (cleaned.trim() === '') return { ok: false, reason: `${path}: empty` }
  try {
    const value = JSON.parse(cleaned)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: `${path}: top level must be a JSON object` }
    }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, reason: `${path}: not valid JSON: ${error.message}` }
  }
}

export function resolveGraph(projectRoot) {
  const localPath = joinRel(projectRoot, GRAPH_OVERRIDE_REL)
  const localRaw = readText(localPath)
  if (localRaw !== undefined) {
    const parsed = parseGraph(localRaw, localPath)
    if (parsed.ok) return { tier: 'local_override', graph: parsed.value, path: localPath }
    return { tier: 'broken', reason: parsed.reason, path: localPath }
  }

  const resolution = resolve(projectRoot)
  const rel = resolution.config?.fsm?.graph
  if (typeof rel !== 'string' || rel.trim() === '') {
    return { tier: 'miss', reason: 'resolved config has no fsm.graph pointer' }
  }
  const trimmed = rel.trim().replace(/^\/+|\/+$/g, '')
  const pathErr = validateSourcePath(trimmed)
  if (pathErr !== undefined) return { tier: 'broken', reason: pathErr }
  if (resolution.cacheDir === undefined) {
    return { tier: 'miss', reason: resolution.why }
  }
  const full = joinRel(resolution.cacheDir, trimmed)
  if (!pathContainedWithin(resolution.cacheDir, full)) {
    return { tier: 'broken', reason: `fsm.graph resolves to ${full}, which escapes ${resolution.cacheDir}` }
  }
  const raw = readText(full)
  if (raw === undefined) return { tier: 'miss', path: full }
  const parsed = parseGraph(raw, full)
  if (parsed.ok) return { tier: 'source_repo', graph: parsed.value, path: full }
  return { tier: 'broken', reason: parsed.reason, path: full }
}

export function resolveHookPath(projectRoot, hookPath) {
  const pathErr = validateSourcePath(hookPath)
  if (pathErr !== undefined) return { reason: pathErr }
  const resolution = resolve(projectRoot)
  const dir = resolution.config?.fsm?.hooks_dir
  const hooksDir = typeof dir === 'string' && dir.trim() !== '' ? dir.trim() : 'hooks'
  const dirErr = validateSourcePath(hooksDir)
  if (dirErr !== undefined) return { reason: dirErr }
  const local = joinRel(projectRoot, `.gm/instructions/hooks/${hookPath}`)
  const localRaw = readText(local)
  if (localRaw !== undefined) return { path: local, exists: true }
  if (resolution.cacheDir === undefined) return { path: local, exists: false }
  const full = joinRel(resolution.cacheDir, joinRel(hooksDir, hookPath))
  if (!pathContainedWithin(resolution.cacheDir, full)) {
    return { reason: `hook path ${full} escapes ${resolution.cacheDir}` }
  }
  return { path: full, exists: readText(full) !== undefined }
}
