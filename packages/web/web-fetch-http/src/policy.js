import { isIP } from 'node:net'
import { WebError } from '@freddie/freddie-web'
import { classifyAddress, normalizeHostname } from './address.js'

const RESERVED_NAME_SUFFIXES = ['localhost', 'local', 'internal', 'localdomain', 'home.arpa']

export function validateFetchUrl(input, maxUrlLength) {
  if (typeof input !== 'string' || input.length > maxUrlLength) {
    throw new WebError(`URL is missing or exceeds the maximum length of ${maxUrlLength}`, 'WEB_INVALID_URL')
  }
  let url
  try {
    url = new URL(input)
  } catch (error) {
    throw new WebError('invalid URL', 'WEB_INVALID_URL', { cause: error })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebError(`unsupported URL scheme "${url.protocol}" (only http and https are allowed)`, 'WEB_INVALID_URL')
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new WebError('credentials in URLs are not allowed', 'WEB_BLOCKED_URL')
  }
  assertPublicDestination(url)
  return url
}

export function assertPublicDestination(url) {
  const host = normalizeHostname(url.hostname)
  if (host === '') {
    throw new WebError('URL has no host', 'WEB_INVALID_URL')
  }
  if (isIP(host) !== 0) {
    const reason = classifyAddress(host)
    if (reason !== undefined) {
      throw new WebError(`URL destination is not a public address (${reason})`, 'WEB_BLOCKED_URL')
    }
    return
  }
  if (RESERVED_NAME_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new WebError('URL destination is not a public host (reserved name)', 'WEB_BLOCKED_URL')
  }
}

export function isSameOrigin(a, b) {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port
}

export function classifyContentType(contentType) {
  const mime = (contentType ?? '').replace(/;.*$/s, '').trim().toLowerCase()
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (mime.startsWith('text/')) return 'text'
  if (mime === 'application/json' || mime === 'application/xml' || mime.endsWith('+json') || mime.endsWith('+xml')) return 'text'
  return undefined
}

export function parseCharset(contentType) {
  const match = /;\s*charset\s*=\s*"?([^";]+)"?/i.exec(contentType ?? '')
  return match?.[1]?.trim().toLowerCase()
}

export function decoderForCharset(charset) {
  if (charset === undefined) return new TextDecoder('utf-8')
  try {
    return new TextDecoder(charset)
  } catch (error) {
    throw new WebError(`unsupported charset "${charset}"`, 'WEB_UNSUPPORTED_CONTENT_TYPE', { cause: error })
  }
}
