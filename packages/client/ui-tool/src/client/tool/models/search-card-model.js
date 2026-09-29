/**
 * Pure derivation of the search-card props from a frozen call slice: the
 * `card:'search'` render intent the `grep` and `glob` tools declare arrives on
 * the snapshot as `resultView`, and this is the one place that turns it into
 * what {@link import('../../../../../ui-primitives/src/SearchBlock.js').SearchBlock} draws. Both conversation render sites (the chat tool
 * row's resident body and the details panel's Output section) call this, so the
 * grouped matches or the path list they show are derived once.
 *
 * The search card is result-time only: a search call has no matches or paths
 * before `execute`, so its pending state stays a `GenericCallView`
 * ({@link module:@freddie/freddie-tools/src/presentation}). This derivation
 * therefore reads only `resultView` and returns null for a still-running call,
 * unlike the terminal card whose call view carries the command before
 * execution.
 *
 * A capped result also carries a recovery locator (grep/glob's `Full … stored
 * at …` footer) in the raw `tool/result` content, not in the structured
 * matches/paths the view carries. Since both render sites replace that raw
 * result with the card, this derivation surfaces the block's own result text as
 * {@link SearchCardProps}'s `recovery` field so the one path to the dropped rows
 * is not lost.
 * @module
 */

/**
 * Result rows the chat row's resident search body shows before collapsing the
 * middle — half the primitive's own default, which the details panel keeps. A
 * chat row is a summary surface inside the message flow: the flow must stay
 * scannable across many calls, while the details panel is the single-call
 * reading surface. A design constant of this UI's row geometry, not a
 * deployment choice, so it is fixed here rather than a plugin Config field.
 */
export const CHAT_SEARCH_MAX_LINES = 8

/**
 * One matched file's grouped results, the shape {@link import('../../../../../ui-primitives/src/SearchBlock.js').SearchBlockProps}'s
 * `files` field carries.
 * @typedef {object} SearchFileGroup
 * @property {string} path - the matched file's path.
 * @property {Array<{lineNumber: number, line: string}>} matches - one entry per matching line in this file.
 */

/**
 * Whether every file group in a matches view is structurally valid: the wire
 * frame carries `shape` and `card` as strings the host schema checks, but not the
 * grouped `files` fields, so a version mismatch or loose producer could deliver
 * `shape: 'matches'` with a missing or malformed `files`. Rendering that would
 * crash {@link import('../../../../../ui-primitives/src/SearchBlock.js').SearchBlock} at `.reduce`/`.map`; invalid fields select the
 * generic path instead.
 * @param files - the candidate `files` field off the untrusted result view.
 * @returns whether `files` is a valid {@link SearchFileGroup} array.
 */
function isValidFiles(files) {
  return Array.isArray(files) && files.every(file =>
    typeof file === 'object' && file !== null
    && typeof file.path === 'string'
    && Array.isArray(file.matches)
    && file.matches.every(match =>
      typeof match === 'object' && match !== null
      && typeof match.lineNumber === 'number'
      && typeof match.line === 'string'))
}

/**
 * Flatten a settled tool result's content blocks to their text, joined by
 * newlines. The search view carries no result text — a UI without a card falls
 * back to the raw `tool/result` content — so the truncation recovery footer is
 * read from the block's own content here. Non-text blocks (a search result
 * carries none) are skipped.
 * @param content - the result node's content blocks.
 * @returns the joined text, or undefined when empty.
 */
function flattenContent(content) {
  const text = content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
  return text === '' ? undefined : text
}

/**
 * The search-card props {@link searchCardModel} returns for a settled call.
 * @typedef {object} SearchCardProps
 * @property {string} [title] - replacement title from the search view, when the tool supplied one.
 * @property {string} [recovery] - the raw result text carrying the truncation-recovery footer, present only when the result was truncated.
 * @property {{kind: 'matches', files: SearchFileGroup[], truncated: boolean, total: number}|{kind: 'paths', paths: string[], truncated: boolean, total: number}} card - the shape {@link import('../../../../../ui-primitives/src/SearchBlock.js').SearchBlock} renders.
 */

/**
 * Derive the search-card props for a tool call, or null when this call is not a
 * search card and belongs on the generic path.
 *
 * Only the result side matters: the search card carries no call-time state, so
 * a still-running call (no result view) is null, as is a settled call whose
 * result view is not a search card — including a `card` value this UI version
 * does not know, which arrives over the wire and cannot be trusted to be one of
 * the compiled variants, a `card: 'search'` view whose `shape` is neither
 * `matches` nor `paths` (equally untrusted wire data), and a generic result a
 * `grep`/`glob` failure or nested `run_code` dispatch produces (its text keeps
 * the generic path).
 * @param block - RunningToolCall or ToolResultNode off the snapshot caches.
 * @returns {SearchCardProps|null} the search-card props, or null for the generic path.
 */
export function searchCardModel(block) {
  if (!('kind' in block)) return null
  const result = block.resultView?.card === 'search' ? block.resultView : null
  if (result === null) return null
  const common = { truncated: result.truncated, total: result.total }
  const recovery = result.truncated ? flattenContent(block.content) : undefined
  if (result.shape === 'matches') {
    if (!isValidFiles(result.files)) return null
    return { title: result.title, recovery, card: { kind: 'matches', files: result.files, ...common } }
  }
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- shape is wire data; the compiled union cannot prove this exhaustive.
  if (result.shape !== 'paths') return null
  if (!Array.isArray(result.paths) || !result.paths.every(path => typeof path === 'string')) return null
  return { title: result.title, recovery, card: { kind: 'paths', paths: result.paths, ...common } }
}
