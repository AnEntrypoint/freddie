import { structuredPatch } from 'diff'

export const DIFF_CONTEXT = 3

export function computeHunkDiffs(path, before, after) {
  const patch = structuredPatch('', '', before, after, undefined, undefined, { context: DIFF_CONTEXT })
  const diffs = []
  for (const hunk of patch.hunks) {
    const oldLines = []
    const newLines = []
    for (const line of hunk.lines) {
      if (line.startsWith('\\')) continue
      const text = line.slice(1)
      if (line.startsWith('-')) {
        oldLines.push(text)
      } else if (line.startsWith('+')) {
        newLines.push(text)
      } else {
        oldLines.push(text)
        newLines.push(text)
      }
    }
    diffs.push({ path, oldText: oldLines.length > 0 ? oldLines.join('\n') : null, newText: newLines.join('\n') })
  }
  return diffs
}

function isFileDiff(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { path, oldText, newText } = value
  return typeof path === 'string'
    && (oldText === null || typeof oldText === 'string')
    && typeof newText === 'string'
}

export function diffsFromMeta(meta) {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const diffs = meta.diffs
  if (!Array.isArray(diffs) || diffs.length === 0 || !diffs.every(isFileDiff)) return undefined
  return diffs
}
