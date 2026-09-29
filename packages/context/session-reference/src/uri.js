
import { SessionId } from '@freddie/freddie-session'
import { SessionReferenceError } from './config.js'

export const SESSION_REFERENCE_SCHEME = 'freddie-session:'

export function encodeSessionReferenceUri(sessionId) {
  const payload = Buffer.from(JSON.stringify(sessionId), 'utf8').toString('base64url')
  return `${SESSION_REFERENCE_SCHEME}${payload}`
}

export function decodeSessionReferenceUri(uri) {
  if (!uri.startsWith(SESSION_REFERENCE_SCHEME)) {
    throw invalidUri(uri)
  }
  const payload = uri.slice(SESSION_REFERENCE_SCHEME.length)
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw invalidUri(uri)
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof parsed !== 'string') throw new TypeError('decoded session id is not a string')
    const sessionId = SessionId(parsed)
    if (encodeSessionReferenceUri(sessionId) !== uri) throw new TypeError('URI is not canonical')
    return sessionId
  } catch (error) {
    throw invalidUri(uri, error)
  }
}

export function formatSessionReferenceMention(reference) {
  const label = escapeLabel(reference.label ?? reference.sessionId)
  return `@[${label}](${encodeSessionReferenceUri(reference.sessionId)})`
}

export function parseSessionReferenceText(text) {
  const references = []
  const pattern = /@\[((?:\\.|[^\\\]])*)\]\((freddie-session:[^\s)]*)\)|(freddie-session:[A-Za-z0-9_-]+)/gu
  const rendered = text.replace(pattern, (
    _match,
    rawLabel,
    markdownUri,
    bareUri,
  ) => {
    const uri = markdownUri ?? bareUri
    /* v8 ignore next -- the two-alternative regex always captures exactly one URI group. */
    if (uri === undefined) throw new SessionReferenceError('session reference URI is missing', 'SESSION_REFERENCE_INVALID_REFERENCE')
    const sessionId = decodeSessionReferenceUri(uri)
    const label = rawLabel === undefined ? sessionId : unescapeLabel(rawLabel)
    references.push({ sessionId, label })
    return `@${label}`
  })
  return { text: rendered, references }
}

function escapeLabel(label) {
  return label.replace(/[\\\]]/gu, match => `\\${match}`)
}

function unescapeLabel(label) {
  return label.replace(/\\(.)/gu, '$1')
}

function invalidUri(uri, cause) {
  return new SessionReferenceError(
    `invalid session reference URI ${JSON.stringify(uri)}`,
    'SESSION_REFERENCE_INVALID_REFERENCE',
    cause === undefined ? undefined : { cause },
  )
}
