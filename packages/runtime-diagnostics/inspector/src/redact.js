/**
 * Secret redaction for captured fetch metadata and bodies.
 *
 * Upstream records "the complete URL, all request and response headers, request
 * body, response body" and states outright that it "does not redact credentials,
 * cookies, query values, or payloads". freddie does not: this surface is a
 * debugger an operator opens beside a live Host, and a captured `Authorization`
 * header is a credential leaving the process the moment it is rendered. Header,
 * query, and userinfo redaction is therefore unconditional and has no opt-out.
 * Bodies are not captured at all unless the composition asks for them, and even
 * then they pass through {@link redactText} before retention.
 * @module @freddie/freddie-inspector/redact
 */

import { REDACTED } from './shared.js'

/** Header-name substrings whose value is always a credential or a session bearer. */
const SENSITIVE_HEADER_PARTS = Object.freeze([
  'auth', 'cookie', 'token', 'secret', 'credential', 'password', 'passwd', 'key',
  'session', 'signature', 'bearer', 'otp', 'pin',
])

/** Whole query-parameter names treated as secrets. */
const SENSITIVE_QUERY_NAMES = Object.freeze(new Set([
  'token', 'access_token', 'refresh_token', 'id_token', 'auth', 'authorization',
  'api_key', 'apikey', 'api-key', 'key', 'secret', 'client_secret', 'password',
  'passwd', 'pwd', 'session', 'session_id', 'sessionid', 'sid', 'signature',
  'sig', 'code', 'state', 'otp',
]))

/** Body patterns: bearer/basic challenges, `sk-`-prefixed keys, and JSON secret fields. */
const BODY_PATTERNS = Object.freeze([
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{4,}/gi, '$1 ' + REDACTED],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-' + REDACTED],
  [/\bghp_[A-Za-z0-9]{8,}/g, 'ghp_' + REDACTED],
  [/\bgho_[A-Za-z0-9]{8,}/g, 'gho_' + REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{8,}/g, 'github_pat_' + REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{8,}/g, 'xox$-' + REDACTED],
  [
    /"([^"\n]{0,64}(?:token|secret|password|passwd|api[_-]?key|authorization)[^"\n]{0,64})"\s*:\s*"([^"\n]*)"/gi,
    (_match, key) => `${JSON.stringify(key)}: ${JSON.stringify(REDACTED)}`,
  ],
  [
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?([^\s"',&}]{4,})/gi,
    (_match, key) => `${key}=${REDACTED}`,
  ],
])

/**
 * Whether a header name carries a credential or session bearer.
 * @param {string} name - header name, any case.
 * @returns {boolean} true when the value must be replaced.
 */
export function isSensitiveHeader(name) {
  const lowered = String(name).toLowerCase()
  return SENSITIVE_HEADER_PARTS.some(part => lowered.includes(part))
}

/**
 * Redact every sensitive header value. Over-redaction is the intended
 * direction: a header named `x-session-id` is worth losing to keep `cookie`.
 * @param {Iterable<[string, string]>} entries - header entries as published by `Headers`.
 * @returns {Record<string, string>} the same names with sensitive values replaced.
 */
export function redactHeaders(entries) {
  const out = {}
  for (const [name, value] of entries) out[name] = isSensitiveHeader(name) ? REDACTED : value
  return out
}

/** The query rebuilt from decoded parameters, so the redaction marker's brackets stay readable in a Network panel. */
function queryWithReadableRedactionMarker(url) {
  const pairs = []
  for (const [name, value] of url.searchParams.entries()) {
    const shown = SENSITIVE_QUERY_NAMES.has(name.toLowerCase()) ? REDACTED : encodeURIComponent(value)
    pairs.push(`${name}=${shown}`)
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : ''
}

/**
 * Redact a URL's userinfo and secret query parameters. The origin, path, and
 * non-secret query values survive, which is what a Network panel needs.
 * @param {string} raw - absolute or relative URL as observed.
 * @returns {string} the URL with credentials and secret query values replaced.
 */
export function redactUrl(raw) {
  if (typeof raw !== 'string') return ''
  let url
  try {
    url = new URL(raw)
  } catch (_nonAbsoluteUrlStillMustBeRedactedBeforeLeavingTheProcess) {
    return redactText(raw)
  }
  const query = queryWithReadableRedactionMarker(url)
  const userinfo = url.username === '' && url.password === '' ? '' : `${REDACTED}@`
  return `${url.protocol}//${userinfo}${url.host}${url.pathname}${query}${url.hash}`
}

/**
 * Best-effort in-place redaction of a captured body. Patterns beat structure
 * here: a body is arbitrary bytes to this package, and a missed match is only
 * safe when bodies are off, which is why {@link import('./options.js').resolveInspectorOptions}
 * defaults `captureBodies` to false.
 * @param {string} text - decoded body text.
 * @returns {string} the text with recognized secrets replaced.
 */
export function redactText(text) {
  let out = String(text)
  for (const [pattern, replacement] of BODY_PATTERNS) out = out.replace(pattern, replacement)
  return out
}
