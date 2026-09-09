/**
 * UI presentation for native gm_* tools. Presenters are pure functions of
 * args/result so replay of an older log falls back to the generic card
 * instead of throwing.
 * @module @freddie/freddie-tool-gm/presentation
 */

/** Cooperative tool-call budget matching gm-client's spool default. */
export const GM_TOOL_TIMEOUT_MS = 120_000

/** `gm_codesearch` budget: live dual-index codesearch on this machine runs 4–5 minutes. */
export const GM_CODESEARCH_TIMEOUT_MS = 360_000

/** `gm_scan_deps` budget: live walk of this repo's git-tracked source plus node_modules. */
export const GM_SCAN_DEPS_TIMEOUT_MS = 180_000

function asRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value
}

function nestedData(value) {
  const record = asRecord(value)
  if (record === undefined) return undefined
  return asRecord(record.data) ?? record
}

function hitLocation(hit) {
  const record = asRecord(hit)
  if (record === undefined) return undefined
  const symbol = asRecord(record.symbol)
  const path = typeof symbol?.path === 'string'
    ? symbol.path
    : typeof record.path === 'string' ? record.path : undefined
  if (path === undefined) return undefined
  const lineNumber = typeof symbol?.line_start === 'number'
    ? symbol.line_start
    : typeof record.line_start === 'number' ? record.line_start
      : typeof record.line === 'number' ? record.line
        : 1
  const line = typeof record.text === 'string'
    ? record.text
    : typeof record.snippet === 'string' ? record.snippet
      : path
  return { path, lineNumber, line }
}

function collectHits(value) {
  const root = nestedData(value)
  if (root === undefined) return []
  const hits = []
  for (const key of ['bm25_hits', 'vector_hits', 'hits', 'commits']) {
    const list = root[key]
    if (!Array.isArray(list)) continue
    for (const hit of list) hits.push(hit)
  }
  return hits
}

function groupMatchesByFile(locations) {
  const files = []
  const index = new Map()
  for (const location of locations) {
    let file = index.get(location.path)
    if (file === undefined) {
      file = { path: location.path, matches: [] }
      index.set(location.path, file)
      files.push(file)
    }
    file.matches.push({ lineNumber: location.lineNumber, line: location.line })
  }
  return files
}

/**
 * Project a codesearch verb body into search-card meta with real file:line
 * locations from bm25 `symbol.path`/`line_start`, `vector_hits.path`,
 * filename-mode `hits.path`, or commit-vector `commits`.
 * @param value - parsed gm codesearch response.
 * @returns matches-shaped search metadata.
 */
export function codesearchMetaFromValue(value) {
  const locations = []
  for (const hit of collectHits(value)) {
    const location = hitLocation(hit)
    if (location !== undefined) locations.push(location)
  }
  return {
    shape: 'matches',
    files: groupMatchesByFile(locations),
    truncated: nestedData(value)?.truncated === true,
    total: locations.length,
  }
}

/**
 * Pending codesearch card titled by the query.
 * @param args - raw tool arguments.
 */
export function presentCodesearchCall(args) {
  return { card: 'generic', title: args.query, kind: 'search', rawInput: args.query }
}

/**
 * Completed codesearch card from replayable meta.
 * @param _args - unused; the view derives from the result.
 * @param result - model-facing tool result.
 */
export function presentCodesearchResult(_args, result) {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  if (meta === undefined || meta.shape !== 'matches' || !Array.isArray(meta.files)) return undefined
  if (typeof meta.truncated !== 'boolean' || typeof meta.total !== 'number') return undefined
  return { card: 'search', shape: 'matches', files: meta.files, truncated: meta.truncated, total: meta.total }
}

function recallHits(value) {
  const root = nestedData(value)
  if (root === undefined) return []
  return Array.isArray(root.hits) ? root.hits : []
}

function recallKeys(value) {
  const keys = []
  for (const hit of recallHits(value)) {
    const record = asRecord(hit)
    if (typeof record?.key === 'string') keys.push(record.key)
  }
  return keys
}

/**
 * Project a recall verb body into a key list (recall has no file:line).
 * @param value - parsed gm recall response.
 */
export function recallMetaFromValue(value) {
  const keys = recallKeys(value)
  return { keys, total: keys.length }
}

/**
 * Pending recall card titled by the query.
 * @param args - raw tool arguments.
 */
export function presentRecallCall(args) {
  return { card: 'generic', title: args.query, kind: 'search', rawInput: args.query }
}

/**
 * Completed recall summary of hit keys, not file:line.
 * @param _args - unused.
 * @param result - model-facing tool result.
 */
export function presentRecallResult(_args, result) {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  if (meta === undefined || !Array.isArray(meta.keys)) return undefined
  const title = meta.keys.length === 0
    ? 'gm recall: no hits'
    : `gm recall: ${meta.keys.length} hits`
  return { card: 'generic', title, kind: 'search', rawInput: meta.keys.join(', ') }
}

function compactPhaseTitle(verb, value) {
  const root = nestedData(value)
  const phase = typeof root?.phase === 'string' ? root.phase : undefined
  const pending = typeof root?.prd_pending_count === 'number'
    ? root.prd_pending_count
    : typeof root?.prd_pending === 'number' ? root.prd_pending
      : undefined
  const parts = [verb]
  if (phase !== undefined) parts.push(phase)
  if (pending !== undefined) parts.push(`${pending} PRD pending`)
  return parts.join(' · ')
}

/**
 * Pending instruction card.
 * @param args - raw tool arguments.
 */
export function presentInstructionCall(args) {
  const title = args.prompt === undefined ? 'gm instruction' : `gm instruction: ${args.prompt}`
  return { card: 'generic', title, rawInput: args.prompt ?? '' }
}

/**
 * Completed instruction card titled by phase / PRD count when present.
 * @param _args - unused.
 * @param result - model-facing tool result.
 */
export function presentInstructionResult(_args, result) {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  const title = typeof meta?.title === 'string' ? meta.title : 'gm instruction'
  return { card: 'generic', title, rawInput: title }
}

/**
 * Project instruction/transition JSON into a compact title.
 * @param verb - display verb name.
 * @param value - parsed gm response.
 */
export function compactMetaFromValue(verb, value) {
  return { title: compactPhaseTitle(verb, value) }
}

/**
 * Pending transition card titled with the target phase.
 * @param args - raw tool arguments.
 */
export function presentTransitionCall(args) {
  return { card: 'generic', title: `gm transition → ${args.to}`, rawInput: args.to }
}

/**
 * Completed transition card titled by phase when present.
 * @param _args - unused.
 * @param result - model-facing tool result.
 */
export function presentTransitionResult(_args, result) {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  const title = typeof meta?.title === 'string' ? meta.title : 'gm transition'
  return { card: 'generic', title, rawInput: title }
}

/**
 * Compact pending card for remaining gm verbs.
 * @param title - display title.
 */
export function presentGenericCall(title) {
  return { card: 'generic', title, rawInput: title }
}
