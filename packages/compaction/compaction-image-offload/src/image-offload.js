/** Select and log permanent image omissions in current model-request order. */

import { imageOffloadProjection } from './projection.js'

/**
 * Select the oldest retained input-image occurrences still present on the surface.
 * Assistant nodes carry model output and are excluded. Image indexes count every
 * occurrence in depth-first order, including images nested inside tool results.
 * @param session - session whose next request applies the decision.
 * @param sourceEventSeqs - input message events in the failed request's order.
 * @param count - additional retained occurrences the caller needs omitted.
 * @returns one target per contributing message event, empty when nothing remains.
 */
export function selectOldestImageTargets(session, sourceEventSeqs, count) {
  const targets = []
  for (const seq of [...sourceEventSeqs]) {
    if (count === 0) break
    const event = session.events[seq]
    if (event?.type !== 'user/message' && event?.type !== 'tool/result') continue
    const message = session.deriveEventMessage(event)
    const imageIndexes = []
    let imageIndex = 0
    const visit = (blocks) => {
      for (const block of blocks) {
        if (count === 0) break
        if (block.type === 'image') {
          imageIndexes.push(imageIndex)
          count -= 1
          imageIndex += 1
        } else if (block.type === 'tool-result') {
          visit(block.content)
        }
      }
    }
    visit(message.content)
    if (imageIndexes.length > 0) targets.push({ seq, imageIndexes })
  }
  return targets
}

/**
 * Record one decision omitting the oldest retained input-image occurrences and
 * land it as durable surface replacements. The selection event is appended with
 * the envelope's `ignorable` marker because the generated persistence vocabulary
 * names only the types present when `gen-persistence-catalog` last ran.
 * @param session - session whose next request applies the decision.
 * @param sourceEventSeqs - input message events in the failed request's order.
 * @param count - additional retained occurrences the caller needs omitted.
 * @returns whether any occurrence remained to offload.
 */
export function offloadOldestImages(session, sourceEventSeqs, count) {
  const targets = selectOldestImageTargets(session, sourceEventSeqs, count)
  if (targets.length === 0) return false
  const messages = imageOffloadProjection.project(
    { type: 'image/offload', data: { targets } },
    { nodes: [...session.surface.nodes], events: session.events, baseSeq: 0, messages: new Map() },
  )
  session.append('image/offload', { targets }, { ignorable: true })
  for (const [seq, message] of messages) {
    const event = session.events[seq]
    const surface = { surfaceOp: { op: 'replace', start: seq, end: seq }, sourceEventSeqs: [seq] }
    if (event.type === 'tool/result') session.append('tool/result', { ...event.data, message }, surface)
    else session.append('user/message', message, surface)
  }
  return true
}
