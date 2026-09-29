import { z } from 'zod'

const sessionId = z.string()
const artifact = z.object({
  id: z.string(), name: z.string(), kind: z.string(), content: z.string().optional(), bytes: z.number(), revision: z.number(),
  createdAt: z.number(), updatedAt: z.number(), status: z.string(), sharedWith: z.array(z.string()),
  provenance: z.object({ sessionId: z.string(), sourceSeq: z.number().nullable(), actor: z.string() }),
  sharedFrom: z.object({
    sessionId: z.string(), itemId: z.string(), sourceRevision: z.number(),
    sourceProvenance: z.object({ sessionId: z.string(), sourceSeq: z.number().nullable(), actor: z.string() }),
  }).optional(),
})
const auditEntry = z.object({ at: z.number(), op: z.string(), itemId: z.string(), target: z.string().optional(), actor: z.string().optional() })
const view = z.object({ revision: z.number(), items: z.array(artifact), audit: z.array(auditEntry).optional() })
const result = z.union([z.object({ ok: z.literal(true), value: view }), z.object({ ok: z.literal(false), error: z.object({ code: z.string() }).passthrough() })])
const checkpointEntry = z.object({ id: z.string(), name: z.string(), revision: z.number(), bytes: z.number(), updatedAt: z.number(), actor: z.string().nullable(), sourceSeq: z.number().nullable(), foldedAtSeq: z.number() })
const checkpointView = z.object({
  session: z.object({ createdAt: z.number(), cwd: z.string().optional() }),
  revision: z.number(), updatedAt: z.number().nullable(), artifactsRevision: z.number(),
  views: z.object({
    plan: z.array(checkpointEntry), decision: z.array(checkpointEntry), evidence: z.array(checkpointEntry),
    activity: z.object({ events: z.number(), byType: z.record(z.string(), z.number()), lastType: z.string().nullable(), lastSeq: z.number(), lastTime: z.number().nullable() }),
  }),
  watermark: z.object({ sourceSeq: z.number(), headSeq: z.number(), lag: z.number(), fresh: z.boolean() }),
})
const checkpointResult = z.union([z.object({ ok: z.literal(true), value: checkpointView }), z.object({ ok: z.literal(false), error: z.object({ code: z.string() }).passthrough() })])
const checkpoints = z.object({ sessionId, refresh: z.boolean().optional() })
const list = z.object({ sessionId })
const put = z.object({ sessionId, id: z.string().optional(), name: z.string(), kind: z.string(), content: z.string(), ifRevision: z.number(), sourceSeq: z.number().optional(), actor: z.string().optional(), status: z.enum(['active', 'forgotten']).optional() })
const remove = z.object({ sessionId, id: z.string(), ifRevision: z.number() })
const share = z.object({ sessionId, id: z.string(), targetSessionId: z.string(), grant: z.boolean(), ifRevision: z.number() })

function descriptor(method, schema, resultSchema = result) {
  return {
    id: `@freddie/freddie-session-artifacts#sessionArtifacts/${method}`,
    service: 'sessionArtifacts', namespace: 'sessionArtifacts', method, invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: `@freddie/freddie-session-artifacts#${method}:request`, schema } }],
    result: { mode: 'strict', typeSymbol: '@freddie/freddie-session-artifacts#result', schema: resultSchema },
    sourceLocation: { file: 'packages/session/session-artifacts/src/index.js', line: 1, column: 1 },
  }
}

export const TYPERT_REMOTE = { package: '@freddie/freddie-session-artifacts', descriptors: [descriptor('list', list), descriptor('put', put), descriptor('checkpoints', checkpoints, checkpointResult), descriptor('deleteArtifact', remove), descriptor('share', share)] }
export default TYPERT_REMOTE
