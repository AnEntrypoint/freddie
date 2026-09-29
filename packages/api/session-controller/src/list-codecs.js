import { z } from 'zod'

export const projectionValues = z.record(z.string(), z.unknown())

export const projectionHints = z.object({
  'kind': z.union([z.literal('cached'), z.literal('sequenced')]),
  'asOfSeq': z.number(),
  'values': projectionValues,
})

export const sessionSummary = z.object({
  'agentAvailable': z.boolean(),
  'sessionId': z.string(),
  'updatedAt': z.number(),
  'running': z.boolean(),
  'blank': z.boolean(),
  'errored': z.boolean().optional(),
  'parentSessionId': z.string().optional(),
  'origin': z.literal('subagent').optional(),
  'cwd': z.string().optional(),
  'agentPreset': z.string().optional(),
  'readOnly': z.literal(true).optional(),
  'extraHome': z.string().optional(),
  'projections': projectionHints.optional(),
})

export const sessionListValue = z.object({ 'items': z.array(sessionSummary) })
