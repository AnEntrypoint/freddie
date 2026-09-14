/**
 * Conditional file responder shared by every route that serves on-disk
 * bytes under a URL that can outlive their content (`/plugins`, `/workspace`,
 * `/styles`, the `/vendor` live-workspace class, the SPA dist): a strong
 * size+mtime `ETag`, `Last-Modified`, and an empty `304` when the request's
 * validator still matches, so a warm load revalidates instead of
 * re-downloading. `stat` runs before `readFile` on purpose: a write landing
 * between the two then pairs the OLD validator with the NEW body, which the
 * next conditional request corrects with a fresh 200, whereas the reverse
 * order would pin the new validator to stale bytes until the next edit.
 */
import { readFile, stat } from 'node:fs/promises'

const MISS_CODES = new Set(['ENOENT', 'EISDIR', 'ENOTDIR'])

/**
 * Strong validator for one file state: byte size and integer mtime, hex.
 * Carries no path component.
 * @param stats - the file's `fs.Stats`.
 * @returns the quoted ETag value.
 */
export function etagOf(stats) {
  return `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`
}

/**
 * Whether the request's validators match the current file state.
 * `If-None-Match` wins over `If-Modified-Since` when both are present.
 * @param headers - the incoming request headers.
 * @param etag - the current ETag.
 * @param lastModified - the current `Last-Modified` value.
 * @returns true when a 304 is the right answer.
 */
function fresh(headers, etag, lastModified) {
  const ifNoneMatch = headers['if-none-match']
  if (ifNoneMatch !== undefined) {
    return ifNoneMatch === '*' || ifNoneMatch.split(',').some(token => token.trim() === etag)
  }
  return headers['if-modified-since'] === lastModified
}

/**
 * Answer one GET/HEAD for `path` with validators, honouring a conditional
 * request. HEAD carries the same headers and no entity body. Filesystem
 * failures other than an absent/non-file target propagate to the webserver's
 * request-failure handling.
 * @param req - the node:http request.
 * @param res - the node:http response.
 * @param path - absolute file path (already confined to its served root by the caller).
 * @param headers - `content-type`, `cache-control` and any other fixed headers.
 * @returns false when the target is absent or not a file (the caller answers 404).
 */
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
