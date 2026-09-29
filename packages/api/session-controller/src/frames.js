/**
 * Wire schemas for the Session frame streams.
 *
 * `session/follow` and `session/control` hand the Client a stream id, and the
 * frames themselves ride the generic `stream/next` carrier. The carrier is
 * untyped by construction, so these schemas are the frame contract: the Host
 * validates every produced frame against them while the stream is open, which
 * is the only point where a malformed frame can be rejected before it reaches
 * a polling Client.
 *
 * @module @freddie/freddie-session-controller/frames
 */

import { z } from 'zod'

/** One durable Session event as it crosses the wire. */
const wireEvent = z.object({
  'type': z.string(),
  'seq': z.number(),
  'time': z.number(),
  'data': z.unknown(),
  'ignorable': z.literal(true).optional(),
  'sourceEventSeqs': z.unknown().optional(),
  'surfaceOp': z.unknown().optional(),
})

/** Projection values folded to one durable seq. */
const projectionBaseline = z.object({
  'asOfSeq': z.number(),
  'values': z.record(z.string(), z.unknown()),
})

/** `session/follow` frames: an opening snapshot, then every durable event in seq order. */
export const sessionFollowFrameSchema = z.discriminatedUnion('type', [
  z.object({
    'type': z.literal('snapshot'),
    'header': z.unknown(),
    'cursor': z.number(),
    'records': z.array(z.object({
      'type': z.literal('event'),
      'event': wireEvent,
    })),
    'hasMore': z.boolean(),
    'projections': projectionBaseline,
  }),
  z.object({
    'type': z.literal('event'),
    'event': wireEvent,
  }),
])

/** `session/control` frames: one Host-wide baseline, then per-key replacements. */
export const sessionControlFrameSchema = z.discriminatedUnion('type', [
  z.object({
    'type': z.literal('baseline'),
    'value': z.object({
      'projections': z.record(z.string(), projectionBaseline),
    }),
  }),
  z.object({
    'type': z.literal('projection'),
    'sessionId': z.string(),
    'key': z.string(),
    'value': z.unknown(),
    'seq': z.number(),
  }),
])
