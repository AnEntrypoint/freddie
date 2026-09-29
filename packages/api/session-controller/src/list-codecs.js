/**
 * Strict wire codec for one Session-list row, shared by the Host and Client
 * manifests so both faces of `session/list` can never drift apart.
 *
 * The row carries every field the legacy `session.list` row carries: the
 * freddie-only `errored`, `agentPreset`, `readOnly`, and `extraHome` ride
 * beside dsh's own fields, and a read-only row from a foreign session root has
 * no attached Agent and no projection block.
 *
 * @module @freddie/freddie-session-controller/list-codecs
 */
import { z } from 'zod'

/** Projection values folded to one durable seq, keyed by projection unit. */
export const projectionValues = z.record(z.string(), z.unknown())

/** Partial, possibly stale projection hints of one list row. */
export const projectionHints = z.object({
  'kind': z.union([z.literal('cached'), z.literal('sequenced')]),
  'asOfSeq': z.number(),
  'values': projectionValues,
})

/** One Session-list row. */
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

/** The `session/list` result value. */
export const sessionListValue = z.object({ 'items': z.array(sessionSummary) })
