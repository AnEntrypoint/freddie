import { readFile, stat } from 'node:fs/promises'

const MISS_CODES = new Set(['ENOENT', 'EISDIR', 'ENOTDIR'])

export function etagOf(stats) {
  return `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`
}

function fresh(headers, etag, lastModified) {
  const ifNoneMatch = headers['if-none-match']
  if (ifNoneMatch !== undefined) {
    return ifNoneMatch === '*' || ifNoneMatch.split(',').some(token => token.trim() === etag)
  }
  return headers['if-modified-since'] === lastModified
}

export async function sendFile(req, res, path, headers) {
  let stats
  try {
    stats = await stat(path)
  } catch (error) {
    if (!MISS_CODES.has(error.code)) throw error
    return false
  }
  if (!stats.isFile()) return false
  const etag = etagOf(stats)
  const lastModified = stats.mtime.toUTCString()
  const out = { ...headers, 'etag': etag, 'last-modified': lastModified }
  if (fresh(req.headers, etag, lastModified)) {
    res.writeHead(304, out)
    res.end()
    return true
  }
  let body
  try {
    body = await readFile(path)
  } catch (error) {
    if (!MISS_CODES.has(error.code)) throw error
    return false
  }
  res.writeHead(200, { ...out, 'content-length': String(body.length) })
  res.end(req.method === 'HEAD' ? undefined : body)
  return true
}
