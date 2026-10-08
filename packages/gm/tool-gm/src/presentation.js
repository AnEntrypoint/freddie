export const GM_TOOL_TIMEOUT_MS = 120_000

export const GM_CODESEARCH_TIMEOUT_MS = 360_000

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

export function presentCodesearchCall(args) {
  return { card: 'generic', title: args.query, kind: 'search', rawInput: args.query }
}

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

export function recallMetaFromValue(value) {
  const keys = recallKeys(value)
  return { keys, total: keys.length }
}

export function presentRecallCall(args) {
  return { card: 'generic', title: args.query, kind: 'search', rawInput: args.query }
}

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

export function presentInstructionCall(args) {
  const title = args.prompt === undefined ? 'gm instruction' : `gm instruction: ${args.prompt}`
  return { card: 'generic', title, rawInput: args.prompt ?? '' }
}

export function presentInstructionResult(_args, result) {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  const title = typeof meta?.title === 'string' ? meta.title : 'gm instruction'
  return { card: 'generic', title, rawInput: title }
}

export function compactMetaFromValue(verb, value) {
  return { title: compactPhaseTitle(verb, value) }
}

export function presentTransitionCall(args) {
  return { card: 'generic', title: `gm transition → ${args.to}`, rawInput: args.to }
}

export function presentTransitionResult(_args, result) {
  if (result.isError) return undefined
  const meta = asRecord(result.meta)
  const title = typeof meta?.title === 'string' ? meta.title : 'gm transition'
  return { card: 'generic', title, rawInput: title }
}

export function presentGmOutcomeResult(_args, result) {
  if (result.isError) return undefined
  const block = result.content.find(block => block.type === 'text')
  if (block === undefined || typeof block.text !== 'string') return undefined
  let value
  try {
    value = JSON.parse(block.text)
  } catch (invalidJson) {
    void invalidJson
    return undefined
  }
  const reply = asRecord(value)
  if (reply?.ok !== false) return undefined
  const refused = reply.gate_denied === true
  const diagnostic = refused ? reply.reason ?? reply.error : reply.error ?? reply.reason
  const detail = typeof diagnostic === 'string' && diagnostic !== ''
    ? diagnostic.split('\n', 1)[0]
    : typeof reply.error_code === 'string' ? reply.error_code : undefined
  const title = refused ? 'GM refused' : 'GM failed'
  return { card: 'generic', title: detail === undefined ? title : `${title} · ${detail}` }
}

export function presentGenericCall(title) {
  return { card: 'generic', title, rawInput: title }
}
