import { z } from 'zod'

const sessionId = z.string()
const artifact = z.object({
  id: z.string(), name: z.string(), kind: z.string(), content: z.string().optional(), bytes: z.number(), revision: z.number(),
  createdAt: z.number(), updatedAt: z.number(), status: z.string(), sharedWith: z.array(z.string()),
  provenance: z.object({ sessionId: z.string(), sourceSeq: z.number().nullable(), actor: z.string() }),
})
const view = z.object({ revision: z.number(), items: z.array(artifact) })
const result = z.union([z.object({ ok: z.literal(true), value: view }), z.object({ ok: z.literal(false), error: z.object({ code: z.string() }).passthrough() })])
const list = z.object({ sessionId })
const put = z.object({ sessionId, id: z.string().optional(), name: z.string(), kind: z.string(), content: z.string(), ifRevision: z.number(), sourceSeq: z.number().optional(), actor: z.string().optional() })
const remove = z.object({ sessionId, id: z.string(), ifRevision: z.number() })
const share = z.object({ sessionId, id: z.string(), targetSessionId: z.string(), grant: z.boolean(), ifRevision: z.number() })

function descriptor(method, schema) {
  return {
    id: `@freddie/freddie-session-artifacts#sessionArtifacts/${method}`,
    service: 'sessionArtifacts', namespace: 'sessionArtifacts', method, invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: `@freddie/freddie-session-artifacts#${method}:request`, schema } }],
    result: { mode: 'strict', typeSymbol: '@freddie/freddie-session-artifacts#result', schema: result },
    sourceLocation: { file: 'packages/session/session-artifacts/src/index.js', line: 1, column: 1 },
  }
}

export const TYPERT_REMOTE = { package: '@freddie/freddie-session-artifacts', descriptors: [descriptor('list', list), descriptor('put', put), descriptor('deleteArtifact', remove), descriptor('share', share)] }
export default TYPERT_REMOTE
