
export const CHAT_SEARCH_MAX_LINES = 8

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

function flattenContent(content) {
  const text = content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
  return text === '' ? undefined : text
}

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
  if (result.shape !== 'paths') return null
  if (!Array.isArray(result.paths) || !result.paths.every(path => typeof path === 'string')) return null
  return { title: result.title, recovery, card: { kind: 'paths', paths: result.paths, ...common } }
}
