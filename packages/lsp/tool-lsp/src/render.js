/**
 * Pure formatting and coordinate conversion for the `lsp` tool: one-based↔zero-based UTF-16 cursor
 * conversion, workspace-grouped location rendering with `file:`-URI resolution, complete-result
 * capping, and UI presentation. No I/O — a UI may call the presenter on live streaming and on
 * replay, so it depends only on the tool arguments.
 */

import { posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The four operations the tool exposes, as a runtime tuple for schema enum + validation. */
export const LSP_OPERATIONS = ['goToDefinition', 'findReferences', 'goToImplementation', 'hover']

/** Default cap on rendered locations before an omission marker is appended. */
export const DEFAULT_MAX_LOCATIONS = 100

/** Default cap on the complete rendered tool result, including truncation metadata. */
export const DEFAULT_MAX_RESULT_CHARS = 16_000

/**
 * Validate and convert model arguments: `operation` must be one of the four; `line`/`character` are
 * positive one-based integers converted to the seam's zero-based position.
 * @param {{ operation: string; file_path: string; line: number; character: number }} args - the schema-validated raw arguments.
 * @returns {{ operation: string; filePath: string; position: { line: number; character: number } }} the validated input with a zero-based position.
 * @throws {Error} when the operation is unknown or a coordinate is not a positive integer.
 */
export function parseLspArgs(args) {
  if (!isOperation(args.operation)) {
    throw new Error(`operation must be one of ${LSP_OPERATIONS.join(', ')}`)
  }
  if (args.file_path.trim().length === 0) throw new Error('file_path must be a non-empty string')
  const line = oneBased(args.line, 'line')
  const character = oneBased(args.character, 'character')
  return {
    operation: args.operation,
    filePath: args.file_path,
    position: { line: line - 1, character: character - 1 },
  }
}

/** Whether a string is one of the four operations. */
function isOperation(value) {
  return LSP_OPERATIONS.includes(value)
}

/** Validate a one-based coordinate is a positive integer. */
function oneBased(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer (one-based)`)
  }
  return value
}

/**
 * Render a locations result grouped by file, converting each zero-based location back to a one-based
 * `path:line:character` entry. A `file:` URI inside the workspace becomes a workspace-relative path;
 * outside it, a URI-derived absolute path; a non-`file:` URI is kept verbatim. Applies `maxLocations` and
 * appends an omission marker when it truncates by count, then applies the complete result cap.
 * @param {readonly { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }[]} locations - the seam's locations (possibly empty).
 * @param {string} workspaceUri - the provider's canonical workspace `file:` URI.
 * @param {number} maxLocations - the cap before truncation.
 * @param {number} maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns {string} the rendered text; a distinct no-result line when there are none.
 */
export function formatLocations(locations, workspaceUri, maxLocations, maxResultChars) {
  if (locations.length === 0) return boundResult('No results.', maxResultChars, 'locations')
  const shown = locations.slice(0, maxLocations)
  const omitted = locations.length - shown.length
  const grouped = new Map()
  for (const location of shown) {
    const path = renderUri(location.uri, workspaceUri)
    const line = location.range.start.line + 1
    const character = location.range.start.character + 1
    const entries = grouped.get(path) ?? []
    entries.push(`${path}:${line}:${character}`)
    grouped.set(path, entries)
  }
  const lines = []
  for (const entries of grouped.values()) lines.push(...entries)
  if (omitted > 0) {
    lines.push(`… ${omitted} more location${omitted === 1 ? '' : 's'} omitted (limit ${maxLocations}).`)
  }
  return boundResult(lines.join('\n'), maxResultChars, 'locations')
}

/**
 * Render a hover result, applying `maxResultChars` last and keeping its marker within the cap.
 * @param {{ contents: string } | null} hover - the normalized hover, or `null` for no hover.
 * @param {number} maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns {string} the rendered hover text; a distinct no-result line for `null`.
 */
export function formatHover(hover, maxResultChars) {
  const text = hover === null ? 'No hover information.' : hover.contents
  return boundResult(text, maxResultChars, 'hover')
}

/** Bound a complete rendered result, including the truncation notice itself. */
function boundResult(text, maxChars, label) {
  if (text.length <= maxChars) return text
  const notice = `\n… ${label} truncated (limit ${maxChars} characters).`
  if (notice.length >= maxChars) return notice.slice(0, maxChars)
  return `${text.slice(0, maxChars - notice.length)}${notice}`
}

/**
 * Resolve a location URI without applying the harness host's path rules. A valid `file:` URI becomes
 * workspace-relative when it is under the provider's canonical workspace URI, or a URI-derived
 * absolute path otherwise; malformed and non-`file:` URIs remain verbatim.
 * @param {string} uri - the target URI from the seam.
 * @param {string} workspaceUri - the provider's canonical workspace `file:` URI.
 * @returns {string} the display path or the verbatim URI.
 */
export function renderUri(uri, workspaceUri) {
  if (!uri.startsWith('file:')) return uri
  let target
  let workspace
  try {
    target = new URL(uri)
    workspace = new URL(workspaceUri)
  } catch {
    return uri
  }
  if (workspace.protocol !== 'file:') return uri
  const drivePath = /^\/[a-z](?::|%3A)/iu
  const windowsWorld = workspace.hostname.length > 0 || drivePath.test(workspace.pathname)
  const targetWindowsWorld = windowsWorld && (target.hostname.length > 0 || drivePath.test(target.pathname))
  const workspacePath = filePath(workspace, windowsWorld)
  const targetPath = filePath(target, targetWindowsWorld)
  if (workspacePath === undefined || targetPath === undefined) return uri
  if (windowsWorld !== targetWindowsWorld) return targetPath
  const path = windowsWorld ? win32 : posix
  const relative = path.relative(workspacePath, targetPath)
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  const rendered = relative === '' ? '.' : outside ? targetPath : relative
  return windowsWorld ? rendered.replaceAll('\\', '/') : rendered
}

/** Decode a file URL for its execution world while containing malformed URL failures. */
function filePath(url, windows) {
  try {
    const path = fileURLToPath(url, { windows })
    return path.includes('\0') ? undefined : path
  } catch {
    return undefined
  }
}

/**
 * Pending-call presentation: a search-classified generic card titled by the
 * operation and one-based cursor, focusing the queried line. There is no
 * structured `presentResult` (as `grep`/`glob` have): unlike a match list, a
 * location or hover result has no useful grouped-by-file shape, so the
 * completed call falls back to the plain `tool/result` text
 * {@link formatLocations}/{@link formatHover} already produced. The shared
 * location shape has no character, so the title preserves the column.
 * @param {{ operation: string; file_path: string; line: number; character: number }} args - the raw tool arguments.
 * @returns {{ card: 'generic'; kind: 'search'; title: string; locations: { path: string; line: number }[] }} the generic call view.
 */
export function presentLspCall(args) {
  return {
    card: 'generic',
    kind: 'search',
    title: `LSP ${args.operation} ${args.file_path}:${args.line}:${args.character}`,
    locations: [{ path: args.file_path, line: args.line }],
  }
}
