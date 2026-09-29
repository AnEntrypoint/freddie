import { deriveEventMessage } from '@freddie/freddie-session'
import { estimateMessage } from './estimate.js'

export function foldSurfaceTokens(nodes, event) {
  const message = deriveEventMessage(event)
  const tokens = message === null ? 0 : estimateMessage(message)
  const op = event.surfaceOp
  if (op === 'append') {
    return { tokens, nodes: [...nodes, { seq: event.seq, tokens }], deltaTokens: tokens }
  }
  const startIdx = nodes.findIndex(node => node.seq === op.start)
  const endIdx = nodes.findIndex(node => node.seq === op.end)
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    throw new Error(
      `token surface: replace at seq ${event.seq} has invalid current range ${op.start}-${op.end}`,
    )
  }
  const removed = nodes
    .slice(startIdx, endIdx + 1)
    .reduce((total, node) => total + node.tokens, 0)
  const next = [...nodes]
  next.splice(startIdx, endIdx - startIdx + 1, { seq: event.seq, tokens })
  return { tokens, nodes: next, deltaTokens: tokens - removed }
}
