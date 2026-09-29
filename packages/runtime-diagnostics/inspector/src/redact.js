import { REDACTED } from './shared.js'

const SENSITIVE_HEADER_PARTS = Object.freeze([
  'auth', 'cookie', 'token', 'secret', 'credential', 'password', 'passwd', 'key',
  'session', 'signature', 'bearer', 'otp', 'pin',
])

const SENSITIVE_QUERY_NAMES = Object.freeze(new Set([
  'token', 'access_token', 'refresh_token', 'id_token', 'auth', 'authorization',
  'api_key', 'apikey', 'api-key', 'key', 'secret', 'client_secret', 'password',
  'passwd', 'pwd', 'session', 'session_id', 'sessionid', 'sid', 'signature',
  'sig', 'code', 'state', 'otp',
]))

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

export function isSensitiveHeader(name) {
  const lowered = String(name).toLowerCase()
  return SENSITIVE_HEADER_PARTS.some(part => lowered.includes(part))
}

export function redactHeaders(entries) {
  const out = {}
  for (const [name, value] of entries) out[name] = isSensitiveHeader(name) ? REDACTED : value
  return out
}

function queryWithReadableRedactionMarker(url) {
  const pairs = []
  for (const [name, value] of url.searchParams.entries()) {
    const shown = SENSITIVE_QUERY_NAMES.has(name.toLowerCase()) ? REDACTED : encodeURIComponent(value)
    pairs.push(`${name}=${shown}`)
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : ''
}

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

export function redactText(text) {
  let out = String(text)
  for (const [pattern, replacement] of BODY_PATTERNS) out = out.replace(pattern, replacement)
  return out
}
