
export const CHAT_DIFF_MAX_LINES = 8

function narrowDiffs(diffs) {
  if (!Array.isArray(diffs) || diffs.length === 0) return null
  const out = []
  for (const hunk of diffs) {
    if (typeof hunk !== 'object' || hunk === null) return null
    const { path, oldText, newText } = hunk
    if (typeof path !== 'string') return null
    if (oldText !== null && typeof oldText !== 'string') return null
    if (typeof newText !== 'string') return null
    out.push({ path, oldText, newText })
  }
  return out
}

export function diffCardModel(block) {
  if (!('kind' in block)) {
    const call = block.callView?.card === 'diff' ? block.callView : null
    const diffs = call === null ? null : narrowDiffs(call.diffs)
    return diffs === null ? null : { card: { diffs } }
  }
  const result = block.resultView?.card === 'diff' ? block.resultView : null
  const diffs = result === null ? null : narrowDiffs(result.diffs)
  return diffs === null ? null : { card: { diffs } }
}
