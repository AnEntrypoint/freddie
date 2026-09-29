import { z } from 'zod'

const wireEvent = z.object({
  'type': z.string(),
  'seq': z.number(),
  'time': z.number(),
  'data': z.unknown(),
  'ignorable': z.literal(true).optional(),
  'sourceEventSeqs': z.unknown().optional(),
  'surfaceOp': z.unknown().optional(),
})

const projectionBaseline = z.object({
  'asOfSeq': z.number(),
  'values': z.record(z.string(), z.unknown()),
})

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
