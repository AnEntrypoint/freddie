import { foldSurface } from '@freddie/freddie-session'
import { SessionQueryError } from './config.js'
import { extractSessionEventText } from './extraction.js'

export function buildSessionEventRecords(sessionId, events) {
  const surfaceBySeq = classifySurface(events)
  return events.map(event => ({
    sessionId,
    seq: event.seq,
    type: event.type,
    time: event.time,
    surface: surfaceBySeq.get(event.seq) ?? 'log-only',
  }))
}

export function buildSessionEventSearchDocuments(sessionId, events) {
  const surfaceBySeq = classifySurface(events)
  const documents = []
  for (const event of events) {
    const text = extractSessionEventText(event)
    if (text.length === 0) continue
    documents.push({
      sessionId,
      seq: event.seq,
      type: event.type,
      time: event.time,
      surface: surfaceBySeq.get(event.seq) ?? 'log-only',
      text,
    })
  }
  return documents
}

function classifySurface(events) {
  let folded
  try {
    folded = foldSurface(events)
  } catch (error) {
    throw new SessionQueryError(
      `invalid session surface: ${error instanceof Error ? error.message : 'unknown error'}`,
      'SESSION_QUERY_INVALID_SURFACE',
      { cause: error },
    )
  }
  const result = new Map()
  for (const seq of folded.nodes) result.set(seq, 'current')
  for (const replacement of folded.replacements) {
    for (const seq of replacement.shadowedSeqs) result.set(seq, 'shadowed')
  }
  return result
}
