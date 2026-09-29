/**
 * URL validation and content-type classification for the local HTTP(S) fetch
 * provider — the pure, network-free half. The provider's `fetch()` composes
 * these with transport (redirect following, byte caps, decoding).
 *
 * @module @freddie/freddie-web-fetch-http/policy
 */

import { isIP } from 'node:net'
import { WebError } from '@freddie/freddie-web'
import { classifyAddress, normalizeHostname } from './address.js'

const RESERVED_NAME_SUFFIXES = ['localhost', 'local', 'internal', 'localdomain', 'home.arpa']

/**
 * Validate a request URL against the pre-network policy: http(s) only, no
 * embedded credentials, bounded length, and a destination that is neither a
 * non-public IP literal nor a reserved name (`localhost`, `*.local`,
 * `*.internal`, ...). Resolved addresses are checked later, per hop, by
 * `resolvePublicAddresses`. Returns the parsed `URL`. Throws {@link WebError}
 * otherwise; messages never echo the input URL.
 *
 * @param input - the raw URL string from the fetch request.
 * @param maxUrlLength - inclusive upper bound on `input`'s length.
 * @returns the parsed `URL`.
 */
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

/**
 * Refuse a URL whose host is already known to be non-public without any
 * lookup: an IP literal in a non-public range, or a reserved name.
 *
 * @param url - the parsed URL.
 */
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

/**
 * Two URLs are same-origin when scheme, hostname, and port match. A redirect
 * that crosses origins is refused so each new origin requires a fresh tool call
 * (and thus a fresh provider/permission decision).
 *
 * @param a - one of the two URLs to compare.
 * @param b - the other URL to compare.
 * @returns true when `a` and `b` share scheme, hostname, and port.
 */
export function isSameOrigin(a, b) {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port
}

/**
 * Classify a response `Content-Type` into a decodable body kind, or `undefined`
 * for an unsupported (e.g. binary) type. `text/html` and `application/xhtml+xml`
 * are `html`; other `text/*` plus a few structured text types are `text`.
 *
 * @param contentType - the raw `Content-Type` header, or `null` when the
 *   response carries none (unsupported).
 * @returns the decodable kind, or `undefined` for an unsupported type.
 */
export function classifyContentType(contentType) {
  const mime = (contentType ?? '').replace(/;.*$/s, '').trim().toLowerCase()
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (mime.startsWith('text/')) return 'text'
  if (mime === 'application/json' || mime === 'application/xml' || mime.endsWith('+json') || mime.endsWith('+xml')) return 'text'
  return undefined
}

/**
 * Extract the `charset` parameter from a response `Content-Type`, lower-cased,
 * or `undefined` when absent. The provider feeds this label to `TextDecoder`
 * so a non-UTF-8 response is decoded with its declared encoding rather than
 * silently mangled into replacement characters.
 *
 * @param contentType - the raw `Content-Type` header, or `null` when the
 *   response carries none.
 * @returns the lower-cased charset label, or `undefined` when none is declared.
 */
export function parseCharset(contentType) {
  const match = /;\s*charset\s*=\s*"?([^";]+)"?/i.exec(contentType ?? '')
  return match?.[1]?.trim().toLowerCase()
}

/**
 * Build a `TextDecoder` for the declared charset, falling back to UTF-8 when
 * none is declared. Throws {@link WebError} `WEB_UNSUPPORTED_CONTENT_TYPE` when
 * the label is present but not a charset `TextDecoder` recognizes — better to
 * fail loudly than return mojibake.
 *
 * @param charset - the declared charset label (from {@link parseCharset}), or
 *   `undefined` to default to UTF-8.
 * @returns a decoder for the declared (or defaulted) encoding.
 */
export function decoderForCharset(charset) {
  if (charset === undefined) return new TextDecoder('utf-8')
  try {
    return new TextDecoder(charset)
  } catch (error) {
    throw new WebError(`unsupported charset "${charset}"`, 'WEB_UNSUPPORTED_CONTENT_TYPE', { cause: error })
  }
}
