/**
  * gm.config.json parse/merge matching rs-plugkit `config.rs` parse_config /
  * deep_merge / parse_source_spec. Read-only: never fetches.
  * @module @freddie/freddie-gm-config/src/parse
  */

import { fnv1a64Hex } from './hash.js'
import { joinRel, validateGitRef, validateRepoUrl, validateSourcePath } from './path.js'

export const SCHEMA_VERSION = 1
export const MIN_READABLE_SCHEMA_VERSION = 1

export const PROJECT_CONFIG_REL = '.gm/gm.config.json'
export const SOURCE_SPEC_REL = '.gm/config.source.json'
export const SOURCE_CACHE_REL = '.gm/config-source-cache'
export const DEFAULT_REPO_URL = 'https://github.com/AnEntrypoint/gm-config'
export const DEFAULT_REPO_PINNED_SHA = '993d816b191e551b95f98bf6d1e643587b1a2edc'
export const DEFAULT_REPO_CACHE_REL = '.gm/config-source-cache-default'

export const TIER = {
  ProjectVendored: 'project_vendored',
  ProjectRepoSpec: 'project_repo_spec',
  UserRepoSpec: 'user_repo_spec',
  ImplicitDefaultRepo: 'implicit_default_repo',
  BuiltinDefault: 'builtin_default',
}

const KNOWN_TOP_LEVEL = [
  'version', 'instructions', 'index', 'memory', 'memory_sync', 'cache', 'sync',
  'fsm', 'messages', 'rag', 'scoring', 'embed', 'rssearch', 'git_commits',
  'code_chunks', 'code_index', 'pipeline', 'instruction_payload', 'browser_witness',
  'discipline_note', 'claim_audit', 'db_path', 'memory_md_tables', 'retention',
]

/**
  * Compiled builtin default matching Config::builtin_default.
  * @returns the default config object.
  */
export function builtinDefault() {
  return {
    version: SCHEMA_VERSION,
    instructions: { source: null },
    index: { enabled: true },
    memory: { enabled: true },
  }
}

/**
  * Deep-merge `over` onto `base`. Object keys recurse; any other type is replaced.
  * @param base - lower-priority value.
  * @param over - higher-priority value.
  * @returns merged value.
  */
export function deepMerge(base, over) {
  if (isPlainObject(base) && isPlainObject(over)) {
    const out = { ...base }
    for (const [k, ov] of Object.entries(over)) {
      out[k] = k in base ? deepMerge(base[k], ov) : ov
    }
    return out
  }
  return over
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function typeNameOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function stripBom(text) {
  return text.startsWith('\uFEFF') ? text.slice(1) : text
}

function checkVersion(v, origin) {
  if (!Object.hasOwn(v, 'version')) {
    return { ok: false, reason: `${origin}: missing required \`version\` field (this build understands version ${SCHEMA_VERSION}). An unversioned config cannot be safely interpreted, so it is rejected rather than assumed current.` }
  }
  const n = v.version
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    return { ok: false, reason: `${origin}: \`version\` must be a non-negative integer, found ${JSON.stringify(n)}` }
  }
  if (n < MIN_READABLE_SCHEMA_VERSION) {
    return { ok: false, reason: `${origin}: config declares version ${n}, below the oldest schema this build can read (${MIN_READABLE_SCHEMA_VERSION}). Migrate the config rather than have it silently reinterpreted under new semantics.` }
  }
  return { ok: true, version: n }
}

/**
  * Parse one gm.config.json body.
  * @param text - file contents.
  * @param origin - path used in rejection reasons.
  * @returns `{ kind: 'accepted', version, value } | { kind: 'rejected', reason } | { kind: 'absent' }`.
  */
export function parseConfig(text, origin) {
  const cleaned = stripBom(text)
  if (cleaned.trim() === '') return { kind: 'absent' }
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (error) {
    return { kind: 'rejected', reason: `${origin}: not valid JSON: ${error.message}` }
  }
  if (!isPlainObject(parsed)) {
    return { kind: 'rejected', reason: `${origin}: top level must be a JSON object, found ${typeNameOf(parsed)}` }
  }
  const version = checkVersion(parsed, origin)
  if (!version.ok) return { kind: 'rejected', reason: version.reason }
  return {
    kind: 'accepted',
    version: version.version,
    value: deepMerge(builtinDefault(), parsed),
  }
}

/**
  * Top-level keys this build does not recognise (underscore-prefixed keys are reserved, not unknown).
  * @param value - parsed config object.
  * @returns unknown key names.
  */
export function unknownTopLevelKeys(value) {
  if (!isPlainObject(value)) return []
  return Object.keys(value).filter(k => !k.startsWith('_') && !KNOWN_TOP_LEVEL.includes(k))
}

/**
  * Parse one `{repo, reference, path}` object into a RepoSource.
  * @param obj - source entry.
  * @param origin - path used in rejection reasons.
  * @param cacheRoot - tier cache root.
  * @param tierLabel - tier id string.
  * @returns `{ ok: true, source } | { ok: false, reason }`.
  */
export function parseSourceEntry(obj, origin, cacheRoot, tierLabel) {
  const repo = typeof obj.repo === 'string' ? obj.repo.trim() : ''
  if (repo === '') {
    return { ok: false, reason: `${origin}: source spec requires a non-empty \`repo\` field naming the config repository` }
  }
  const urlErr = validateRepoUrl(repo)
  if (urlErr !== undefined) return { ok: false, reason: `${origin}: ${urlErr}` }
  let reference
  for (const k of ['ref', 'reference', 'branch']) {
    if (typeof obj[k] === 'string' && obj[k].trim() !== '') {
      reference = obj[k].trim()
      break
    }
  }
  if (reference !== undefined) {
    const refErr = validateGitRef(reference)
    if (refErr !== undefined) return { ok: false, reason: `${origin}: ${refErr}` }
  }
  const rawPath = typeof obj.path === 'string' ? obj.path : ''
  const pathErr = validateSourcePath(rawPath)
  if (pathErr !== undefined) return { ok: false, reason: `${origin}: ${pathErr}` }
  const path = rawPath.trim().replace(/^\/+|\/+$/g, '')
  const ident = `${repo}|${reference ?? ''}|${path}`
  const cacheDir = joinRel(cacheRoot, fnv1a64Hex(ident))
  return {
    ok: true,
    source: { repo, reference, path, cacheDir, tierLabel },
  }
}

/**
  * Config file path inside a materialized source.
  * @param source - parsed RepoSource.
  * @returns path of gm.config.json or the entry's `path`.
  */
export function sourceConfigPath(source) {
  if (source.path === '') return joinRel(source.cacheDir, 'gm.config.json')
  return joinRel(source.cacheDir, source.path)
}

/**
  * Parse a config.source.json body (object or array of objects).
  * @param text - file contents.
  * @param origin - path used in rejection reasons.
  * @param cacheRoot - tier cache root.
  * @param tierLabel - tier id string.
  * @returns `{ ok: true, sources } | { ok: false, reason }`.
  */
export function parseSourceSpec(text, origin, cacheRoot, tierLabel) {
  const cleaned = stripBom(text)
  if (cleaned.trim() === '') return { ok: true, sources: [] }
  let v
  try {
    v = JSON.parse(cleaned)
  } catch (error) {
    return { ok: false, reason: `${origin}: not valid JSON: ${error.message}` }
  }
  if (isPlainObject(v)) {
    const one = parseSourceEntry(v, origin, cacheRoot, tierLabel)
    if (!one.ok) return one
    return { ok: true, sources: [one.source] }
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return { ok: false, reason: `${origin}: source spec array must not be empty` }
    const sources = []
    for (let i = 0; i < v.length; i += 1) {
      const item = v[i]
      if (!isPlainObject(item)) {
        return { ok: false, reason: `${origin}: array entry ${i} must be a JSON object, found ${typeNameOf(item)}` }
      }
      const one = parseSourceEntry(item, `${origin}[${i}]`, cacheRoot, tierLabel)
      if (!one.ok) return one
      sources.push(one.source)
    }
    return { ok: true, sources }
  }
  return { ok: false, reason: `${origin}: top level must be a JSON object or an array of objects, found ${typeNameOf(v)}` }
}

export { stripBom }
