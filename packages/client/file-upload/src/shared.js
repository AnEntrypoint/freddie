/**
 * Browser-safe facts shared by both halves of the package: the upload route,
 * the trust pin that guards it, the media types freddie's prompt admission
 * accepts, and the display-name sanitizer both halves apply.
 *
 * Nothing here imports Node builtins — the browser half loads this module.
 * @module @freddie/freddie-client-file-upload/shared
 */

/** Host route path this package registers on the composition's `webServer`. */
export const FILE_UPLOAD_PATH = '/api/session/uploadFileBinary'

/** Document-relative form of {@link FILE_UPLOAD_PATH}; the browser carrier posts here. */
export const FILE_UPLOAD_ROUTE = FILE_UPLOAD_PATH.slice(1)

/**
 * Non-loopback authorities allowed to reach the upload route. Always empty.
 * `client-connection`'s own README states its fence "is a reachability policy,
 * not authentication" and that the Web carrier "provides no authentication
 * layer", so an upload that writes bytes to the operator's disk takes the same
 * pin `client-connection` gives its `PRIVILEGED_METHODS`: loopback only.
 */
export const FILE_UPLOAD_TRUSTED_HOSTS = Object.freeze([])

/** Media types freddie's prompt admission accepts today (see `freddie-attachment`). */
export const PROMPT_IMAGE_MEDIA_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/** Longest display name kept for one upload; longer names are truncated, not refused. */
export const MAX_DISPLAY_NAME_LENGTH = 255

/** Lowest code point kept in a display name; everything below is a C0 control. */
const FIRST_PRINTABLE_CODE_POINT = 0x20

/** Code point of DEL, the one control above the C0 range. */
const DELETE_CODE_POINT = 0x7f

/** Drop C0 controls and DEL without building a pattern over raw control bytes. */
function stripControls(value) {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code >= FIRST_PRINTABLE_CODE_POINT && code !== DELETE_CODE_POINT) out += char
  }
  return out
}

/**
 * Reduce one client-supplied name to a display-only leaf.
 *
 * The result never becomes a path component: the staged destination is derived
 * entirely by the host from the session id and the bytes' own digest. This
 * exists so a filename like `../../.ssh/id_rsa` can never even be carried
 * around looking like a path.
 * @param raw - client-supplied name of any shape.
 * @returns the sanitized leaf, or undefined when nothing displayable remains.
 */
export function displayName(raw) {
  if (typeof raw !== 'string') return undefined
  const leaf = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = stripControls(leaf).replace(/^\.+/, '').trim()
  if (cleaned === '') return undefined
  return cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH)
}
