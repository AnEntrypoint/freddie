
import { imageOffloadProjection } from './projection.js'

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
