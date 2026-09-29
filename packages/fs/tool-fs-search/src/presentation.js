export function groupMatchesByFile(matches) {
  const byFile = new Map()
  for (const match of matches) {
    const entry = { lineNumber: match.lineNumber, line: match.line }
    const group = byFile.get(match.path)
    if (group !== undefined) group.push(entry)
    else byFile.set(match.path, [entry])
  }
  return Array.from(byFile, ([path, fileMatches]) => ({ path, matches: fileMatches }))
}

function metaBytes(meta) {
  return Buffer.byteLength(JSON.stringify(meta), 'utf8')
}

function capMetaBytes(meta, maxMetaBytes) {
  if (metaBytes(meta) <= maxMetaBytes) return meta
  if (meta.shape === 'matches') {
    const files = [...meta.files]
    while (files.length > 1 && metaBytes({ ...meta, files, truncated: true }) > maxMetaBytes) files.pop()
    return { ...meta, files, truncated: true }
  }
  const paths = [...meta.paths]
  while (paths.length > 1 && metaBytes({ ...meta, paths, truncated: true }) > maxMetaBytes) paths.pop()
  return { ...meta, paths, truncated: true }
}

export function grepSearchMeta(retained, maxMetaBytes) {
  const meta = {
    shape: 'matches',
    files: groupMatchesByFile(retained.items),
    truncated: retained.truncated,
    total: retained.seen,
  }
  return capMetaBytes(meta, maxMetaBytes)
}

export function globSearchMeta(retained, maxMetaBytes) {
  const meta = {
    shape: 'paths',
    paths: retained.items,
    truncated: retained.truncated,
    total: retained.seen,
  }
  return capMetaBytes(meta, maxMetaBytes)
}

function isSearchLineMatch(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { lineNumber, line } = value
  return typeof lineNumber === 'number' && typeof line === 'string'
}

function isSearchFileMatches(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { path, matches } = value
  return typeof path === 'string' && Array.isArray(matches) && matches.every(isSearchLineMatch)
}

export function searchViewFromMeta(meta) {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const record = meta
  const { truncated, total } = record
  if (typeof truncated !== 'boolean' || typeof total !== 'number') return undefined
  if (record.shape === 'matches') {
    const { files } = record
    if (!Array.isArray(files) || !files.every(isSearchFileMatches)) return undefined
    return { card: 'search', shape: 'matches', files: files, truncated, total }
  }
  if (record.shape === 'paths') {
    const { paths } = record
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) return undefined
    return { card: 'search', shape: 'paths', paths, truncated, total }
  }
  return undefined
}
