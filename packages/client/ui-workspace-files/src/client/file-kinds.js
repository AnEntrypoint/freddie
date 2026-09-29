/** Pure classification, formatting and failure wording for the workspace files view. */

/** Largest image the view opens: the host's default `readBytes` window, so one read is the whole file. */
export const IMAGE_WINDOW_BYTES = 2 * 1024 * 1024

/** Most lines the preview accumulates through "Load more" before it stops offering more. */
export const MAX_PREVIEW_LINES = 50000

const IMAGE_MIME_BY_EXTENSION = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  svg: 'image/svg+xml',
})

const BINARY_EXTENSIONS = new Set([
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'tar', 'iso', 'dmg',
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'node', 'wasm', 'class', 'jar', 'war', 'pyc',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
  'mp3', 'm4a', 'wav', 'flac', 'ogg', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'sqlite', 'db',
])

const RETRYABLE_KINDS = new Set(['aborted', 'unreadable', 'transport'])

/**
 * @param name - a directory entry name.
 * @returns the lower-case extension without its dot, or an empty string.
 */
export function extensionOf(name) {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * @param name - a directory entry name.
 * @returns the image media type its extension names, or undefined for a non-image.
 */
export function imageMimeOf(name) {
  return IMAGE_MIME_BY_EXTENSION[extensionOf(name)]
}

/**
 * @param name - a directory entry name.
 * @returns whether its extension names a format that is never read as text.
 */
export function isKnownBinary(name) {
  return BINARY_EXTENSIONS.has(extensionOf(name))
}

/**
 * @param bytes - a byte count, when the host reported one.
 * @returns a short human-readable size.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number') return 'unknown size'
  if (bytes < 1024) return `${String(bytes)} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} ${units[unit]}`
}

/**
 * @param parent - the listed directory's workspace-relative path; empty for the root.
 * @param name - an entry name inside it.
 * @returns the entry's workspace-relative path.
 */
export function joinPath(parent, name) {
  return parent === '' ? name : `${parent}/${name}`
}

/**
 * Directories first, then natural case-insensitive name order.
 * @param a - first directory entry.
 * @param b - second directory entry.
 * @returns a sort comparison.
 */
export function compareEntries(a, b) {
  const rank = entry => (entry.type === 'directory' ? 0 : 1)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  const natural = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  return natural !== 0 ? natural : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/**
 * @param error - the `error` of a failed Remote answer.
 * @returns the state kind the view shows, its readable wording, and whether a retry is offered.
 */
export function describeFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : 'unknown'
  const message = typeof error?.message === 'string' ? error.message : ''
  const kind = failureKind(code, message)
  return { kind, message: failureText(kind, error), retry: RETRYABLE_KINDS.has(kind) }
}

function failureKind(code, message) {
  if (code === 'internal' && /\bHTTP 403\b/.test(message)) return 'host-only'
  if (code === 'internal') return 'transport'
  if (code === 'workspace-file/unreadable' && /EACCES|EPERM|permission|access is denied/i.test(message)) return 'permission-denied'
  const known = {
    'workspace-file/not-found': 'not-found',
    'workspace-file/aborted': 'aborted',
    'workspace-file/too-large': 'too-large',
    'workspace-file/not-text': 'not-text',
    'workspace-file/not-regular-file': 'not-regular-file',
    'workspace-file/not-directory': 'not-directory',
    'workspace-file/outside-workspace': 'outside-workspace',
    'workspace-file/root-unavailable': 'no-root',
    'workspace-file/unreadable': 'unreadable',
  }
  return known[code] ?? 'unreadable'
}

function failureText(kind, error) {
  switch (kind) {
    case 'host-only':
      return 'This host only answers file requests from a browser on the same machine as the harness.'
    case 'not-found':
      return 'This file or folder no longer exists.'
    case 'permission-denied':
      return 'Permission denied: the host is not allowed to read this.'
    case 'aborted':
      return 'The host stopped reading this before it finished.'
    case 'too-large':
      return typeof error?.limit === 'number'
        ? `This file is larger than the ${formatBytes(error.limit)} the host will open.`
        : 'This file is larger than the host will open.'
    case 'not-text':
      return 'This file is not text.'
    case 'not-regular-file':
      return 'This is not a regular file, so it cannot be previewed.'
    case 'not-directory':
      return 'This is not a folder.'
    case 'outside-workspace':
      return 'This path is outside the session workspace.'
    case 'no-root':
      return 'This session has no working directory to browse.'
    case 'transport':
      return `The host could not be reached. ${typeof error?.message === 'string' ? error.message : ''}`.trim()
    default:
      return typeof error?.message === 'string' && error.message !== '' ? error.message : 'The host could not read this.'
  }
}

/**
 * @param data - base64 text from a `readBytes` answer.
 * @returns the decoded bytes.
 */
export function base64ToBytes(data) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
