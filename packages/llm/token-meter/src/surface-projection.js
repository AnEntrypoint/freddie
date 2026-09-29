import { deriveEventMessage, isSurfaceEvent } from '@freddie/freddie-session'
import { estimateMessage } from './estimate.js'

export function foldSurfaceProjection(claim, event) {
  if (event.type === 'compaction/summary' || event.type === 'compaction/prune') {
    const { shadowedRange, shadowedTokenCount } = event.data
    return {
      deltaTokens: 0,
      claim: { start: shadowedRange.start, end: shadowedRange.end, tokens: shadowedTokenCount },
    }
  }
  if (!isSurfaceEvent(event)) return { deltaTokens: 0, claim: undefined }
  const message = deriveEventMessage(event)
  const tokens = message === null ? 0 : estimateMessage(message)
  const op = event.surfaceOp
  if (op === 'append') return { deltaTokens: tokens, claim: undefined }
  if (claim === undefined) return { deltaTokens: 0, claim: undefined }
  if (claim.start !== op.start || claim.end !== op.end) {
    throw new Error(
      `token surface: replace at seq ${event.seq} over range ${op.start}-${op.end} has no adjacent shadow price`
      + ` (armed claim covers ${claim.start}-${claim.end})`,
    )
  }
  return { deltaTokens: tokens - claim.tokens, claim: undefined }
}
