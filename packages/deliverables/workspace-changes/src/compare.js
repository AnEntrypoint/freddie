import { structuredPatch } from 'diff'

const CONTEXT_LINES = 3

function terminated(text) {
  return text === '' || text.endsWith('\n') ? text : `${text}\n`
}

function lines(text) {
  return text === '' ? [] : text.slice(0, -1).split('\n')
}

export function compareText(before, after, timeoutMs) {
  const oldText = terminated(before ?? '')
  const newText = terminated(after ?? '')
  const patch = structuredPatch('', '', oldText, newText, undefined, undefined, { context: CONTEXT_LINES, timeout: timeoutMs })
  let hunks
  let coarse = false
  if (patch === undefined) {
    coarse = true
    const oldLines = lines(oldText)
    const newLines = lines(newText)
    hunks = [{
      oldStart: 1, oldLines: oldLines.length,
      newStart: 1, newLines: newLines.length,
      lines: [...oldLines.map(line => `-${line}`), ...newLines.map(line => `+${line}`)],
    }]
  } else {
    hunks = patch.hunks.map(({ oldStart, oldLines, newStart, newLines, lines: body }) =>
      ({ oldStart, oldLines, newStart, newLines, lines: body }))
  }
  let added = 0
  let deleted = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) deleted += 1
    }
  }
  return { hunks, coarse, added, deleted }
}
