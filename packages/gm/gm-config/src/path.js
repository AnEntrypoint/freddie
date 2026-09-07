/**
  * Path and URL allowlists matching rs-plugkit `config_path.rs`.
  * A rejected value is refused, never rewritten into a benign path.
  * @module @freddie/freddie-gm-config/src/path
  */

const MAX_COMPONENT_LEN = 128
const MAX_PATH_LEN = 512
const ALLOWED_URL_SCHEMES = ['https://', 'http://', 'ssh://', 'git://']

/**
  * @param component - one path segment.
  * @param what - label for the error.
  * @returns error string, or undefined when accepted.
  */
function checkComponent(component, what) {
  if (component === '') return `${what}: empty path component`
  if (component.length > MAX_COMPONENT_LEN) {
    return `${what}: path component ${JSON.stringify(component.slice(0, 32))} exceeds ${MAX_COMPONENT_LEN} bytes`
  }
  if (component === '.' || component === '..') {
    return `${what}: path component ${JSON.stringify(component)} would traverse outside the cache directory`
  }
  for (const c of component) {
    const ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-' || c === '_' || c === '.'
    if (!ok) {
      return `${what}: path component ${JSON.stringify(component)} contains ${JSON.stringify(c)}, which is not one of [A-Za-z0-9._-]`
    }
  }
  return undefined
}

/**
  * Validate a prose key for interpolation into `<base>/<key>.md`.
  * @param key - hierarchical key using `/` separators.
  * @returns error string, or undefined when accepted.
  */
export function validateProseKey(key) {
  const what = 'prose key'
  if (key === '') return `${what}: empty`
  if (key.length > MAX_PATH_LEN) return `${what}: exceeds ${MAX_PATH_LEN} bytes`
  if (key.includes('\\')) return `${what}: ${JSON.stringify(key)} contains a backslash; use '/' for hierarchical keys`
  if (key.includes('\0')) return `${what}: contains a NUL byte`
  if (key.startsWith('/')) return `${what}: ${JSON.stringify(key)} is absolute; keys are relative to the instructions directory`
  for (const component of key.split('/')) {
    const err = checkComponent(component, what)
    if (err !== undefined) return err
  }
  return undefined
}

/**
  * Validate the `path` field of a repo-source spec. Empty means repo root.
  * @param path - relative subdirectory inside a materialized config repo.
  * @returns error string, or undefined when accepted.
  */
export function validateSourcePath(path) {
  const what = 'source spec `path`'
  const trimmed = path.trim().replace(/^\/+|\/+$/g, '')
  if (trimmed === '') return undefined
  if (trimmed.length > MAX_PATH_LEN) return `${what}: exceeds ${MAX_PATH_LEN} bytes`
  if (trimmed.includes('\\')) return `${what}: ${JSON.stringify(trimmed)} contains a backslash; use '/' as the separator`
  if (trimmed.includes('\0')) return `${what}: contains a NUL byte`
  for (const component of trimmed.split('/')) {
    const err = checkComponent(component, what)
    if (err !== undefined) return err
  }
  return undefined
}

function isScpLike(url) {
  const colon = url.indexOf(':')
  if (colon <= 0) return false
  if (url.slice(0, colon).includes('/')) return false
  return url.includes('@')
}

/**
  * Validate a git remote URL. Refuses `ext::`, `file://`, local paths, leading `-`.
  * @param url - repo URL from a source spec.
  * @returns error string, or undefined when accepted.
  */
export function validateRepoUrl(url) {
  const what = 'config repo url'
  const u = url.trim()
  if (u === '') return `${what}: empty`
  if (u.length > 2048) return `${what}: exceeds 2048 bytes`
  if (u.startsWith('-')) {
    return `${what}: ${JSON.stringify(u)} starts with '-' and would be parsed by git as an option, not a location`
  }
  for (const c of u) {
    const code = c.charCodeAt(0)
    if (code < 32 || code === 127) return `${what}: contains a control character`
  }
  if (/\s/.test(u)) return `${what}: ${JSON.stringify(u)} contains whitespace; a git remote URL never does`
  const lower = u.toLowerCase()
  if (ALLOWED_URL_SCHEMES.some(s => lower.startsWith(s))) return undefined
  if (isScpLike(u)) return undefined
  return `${what}: ${JSON.stringify(u)} does not use an allowed transport. Permitted: ${ALLOWED_URL_SCHEMES.join(', ')} or git's user@host:path form. Local paths and file:// are refused because a repo-backed tier exists to fetch from elsewhere, and ext:// is refused because git executes it as a command rather than fetching from it.`
}

/**
  * Validate a git ref / branch / sha used as `reference`.
  * @param reference - ref string.
  * @returns error string, or undefined when accepted.
  */
export function validateGitRef(reference) {
  const r = reference.trim()
  if (r === '') return '`ref` is empty'
  if (r.length > 255) return '`ref` exceeds 255 bytes'
  if (r.startsWith('-')) return `\`ref\` ${JSON.stringify(r)} starts with '-' and would be parsed by git as an option, not a ref`
  for (const c of r) {
    const code = c.charCodeAt(0)
    if (code < 32 || code === 127 || /\s/.test(c)) {
      return `\`ref\` ${JSON.stringify(r)} contains whitespace or a control character`
    }
  }
  for (const bad of ['..', '@{', '//', '\\']) {
    if (r.includes(bad)) return `\`ref\` ${JSON.stringify(r)} contains ${JSON.stringify(bad)}, which git rejects`
  }
  if (r.endsWith('.') || r.endsWith('.lock') || r.startsWith('/') || r.endsWith('/')) {
    return `\`ref\` ${JSON.stringify(r)} is not a well-formed git ref`
  }
  for (const c of r) {
    if (c === '~' || c === '^' || c === ':' || c === '?' || c === '*' || c === '[') {
      return `\`ref\` ${JSON.stringify(r)} contains a character git reserves for revision syntax`
    }
  }
  return undefined
}

function normalizeLexically(path) {
  const out = []
  for (const raw of path.replaceAll('\\', '/').split('/')) {
    if (raw === '' || raw === '.') continue
    if (raw === '..') {
      const last = out.at(-1)
      if (last === undefined || last === '..') out.push('..')
      else out.pop()
    } else {
      out.push(raw)
    }
  }
  return out
}

function isRooted(p) {
  const s = p.replaceAll('\\', '/')
  return s.startsWith('/') || s.charAt(1) === ':'
}

/**
  * Whether `candidate` stays inside `root` after lexical `..` normalization.
  * @param root - containing directory.
  * @param candidate - joined path.
  * @returns true when candidate is under root.
  */
export function pathContainedWithin(root, candidate) {
  const c = candidate.replaceAll('\\', '/')
  if (isRooted(c) && !isRooted(root)) return false
  const rootParts = normalizeLexically(root)
  const candParts = normalizeLexically(candidate)
  if (candParts.includes('..')) return false
  if (candParts.length < rootParts.length) return false
  for (let i = 0; i < rootParts.length; i += 1) {
    if (rootParts[i] !== candParts[i]) return false
  }
  return true
}

/**
  * Join base and relative with `/`, trimming trailing slashes on base.
  * @param base - directory.
  * @param rel - relative segment.
  * @returns joined path using `/`.
  */
export function joinRel(base, rel) {
  const b = base.replace(/[/\\]+$/, '')
  if (b === '') return rel
  return `${b}/${rel}`
}
