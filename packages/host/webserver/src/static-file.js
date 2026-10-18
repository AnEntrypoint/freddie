import { open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'

const MISS_CODES = new Set(['ENOENT', 'EISDIR', 'ENOTDIR'])
const compressBrotli = promisify(brotliCompress)
const compressGzip = promisify(gzip)
const BROTLI_QUALITY = 5
const ENCODED_CACHE_BYTE_LIMIT = 32 * 1024 * 1024
const ENCODED_CACHE_ENTRY_LIMIT = 4096
const encodedCache = new Map()
let encodedCacheBytes = 0

function encodingFor(request, headers) {
  const accept = request.headers['accept-encoding']
  if (accept === undefined) return headers['content-encoding'] ?? 'identity'
  const canCompress = headers['content-encoding'] === undefined
    && !/(?:^|,)\s*no-transform\s*(?:,|$)/i.test(headers['cache-control'] ?? '')
    && /^(text\/|application\/(?:javascript|json|manifest\+json)|image\/svg\+xml)/i.test(headers['content-type'] ?? '')
  const weights = new Map()
  for (const token of accept.split(',')) {
    const [name, ...parameters] = token.trim().toLowerCase().split(';')
    const quality = parameters.map(value => /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.exec(value)).find(Boolean)
    const invalidQuality = parameters.some(value => /^\s*q\s*=/i.test(value)) && quality === undefined
    weights.set(name, invalidQuality ? 0 : quality === undefined ? 1 : Number(quality[1]))
  }
  const wildcard = weights.get('*')
  const supported = headers['content-encoding'] === undefined
    ? canCompress ? ['br', 'gzip', 'identity'] : ['identity']
    : [headers['content-encoding']]
  const candidates = supported.map(name => ({
    name,
    weight: weights.get(name) ?? (name === 'identity' ? wildcard === 0 ? 0 : 1 : wildcard ?? 0),
  }))
  candidates.sort((a, b) => b.weight - a.weight)
  return candidates[0].weight > 0 ? candidates[0].name : undefined
}

function representationEtag(etag, encoding) {
  if (encoding === undefined || encoding === 'identity' || etag === undefined) return etag
  return etag.replace(/"$/, `-${encoding}${encoding === 'br' ? BROTLI_QUALITY : ''}"`)
}

function varyEncoding(headers) {
  const vary = headers.vary === undefined ? [] : String(headers.vary).split(',').map(value => value.trim())
  if (!vary.some(value => value === '*' || value.toLowerCase() === 'accept-encoding')) vary.push('Accept-Encoding')
  return vary.join(', ')
}

async function encodedBody(body, encoding) {
  if (encoding === 'identity') return body
  const key = `${encoding}:${encoding === 'br' ? BROTLI_QUALITY : ''}:${createHash('sha256').update(body).digest('hex')}`
  const existing = encodedCache.get(key)
  if (existing !== undefined) {
    encodedCache.delete(key)
    encodedCache.set(key, existing)
    return existing
  }
  const encoded = encoding === 'br'
    ? await compressBrotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } })
    : await compressGzip(body)
  if (encoded.length <= ENCODED_CACHE_BYTE_LIMIT && !encodedCache.has(key)) {
    while (encodedCacheBytes + encoded.length > ENCODED_CACHE_BYTE_LIMIT || encodedCache.size >= ENCODED_CACHE_ENTRY_LIMIT) {
      const oldest = encodedCache.keys().next().value
      encodedCacheBytes -= encodedCache.get(oldest).length
      encodedCache.delete(oldest)
    }
    encodedCache.set(key, encoded)
    encodedCacheBytes += encoded.length
  }
  return encoded
}

export function etagOf(body) {
  return `"${createHash('sha256').update(body).digest('hex')}"`
}

function fresh(headers, etag) {
  const ifNoneMatch = headers['if-none-match']
  if (ifNoneMatch !== undefined) {
    return ifNoneMatch === '*' || etag !== undefined && ifNoneMatch.split(',').some(token => token.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))
  }
  return false
}

export async function sendBody(req, res, body, headers) {
  const encoding = encodingFor(req, headers)
  const out = { ...headers, vary: varyEncoding(headers) }
  if (encoding === undefined) {
    res.writeHead(406, { vary: out.vary })
    res.end()
    return
  }
  const etag = representationEtag(headers.etag, headers['content-encoding'] === undefined ? encoding : 'identity')
  if (etag !== undefined) out.etag = etag
  if (encoding !== 'identity') out['content-encoding'] = encoding
  if (fresh(req.headers, etag)) {
    res.writeHead(304, out)
    res.end()
    return
  }
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body)
  const encoded = headers['content-encoding'] === undefined ? await encodedBody(bytes, encoding) : bytes
  res.writeHead(200, { ...out, 'content-length': String(encoded.length) })
  res.end(req.method === 'HEAD' ? undefined : encoded)
}

export async function sendFile(req, res, path, headers) {
  let file
  try {
    file = await open(path, 'r')
  } catch (error) {
    if (!MISS_CODES.has(error.code)) throw error
    return false
  }
  try {
    const stats = await file.stat()
    if (!stats.isFile()) return false
    const body = await file.readFile()
    await sendBody(req, res, body, { ...headers, etag: etagOf(body), 'last-modified': stats.mtime.toUTCString() })
    return true
  } catch (error) {
    if (!MISS_CODES.has(error.code)) throw error
    return false
  } finally {
    await file.close()
  }
}
