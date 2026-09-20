/** Hand-owned Typert Remote-client manifest for GM graph-edit Remotes. */
import { z } from 'zod'

const agentId = z.intersection(z.string(), z.unknown())
const prdAddRequest = z.object({
  id: z.string(),
  title: z.string().optional(),
  subject: z.string().optional(),
  acceptance: z.string().optional(),
  status: z.string().optional(),
  route_family: z.string().optional(),
})
const prdResolveRequest = z.object({
  id: z.string(),
  witness_evidence: z.string(),
  commit_comment: z.string().optional(),
})
const mutableAddRequest = z.object({
  id: z.string(),
  prd_id: z.string().optional(),
  obligation_kind: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
})
const mutableResolveRequest = z.object({
  id: z.string(),
  witness_text: z.string(),
})
const transitionRequest = z.object({
  to: z.string(),
})
const gmResult = z.record(z.string(), z.unknown())

function descriptor(method, requestSchema, typeSymbol) {
  return {
    id: `@freddie/freddie-gm-client#gm/${method}`,
    service: 'gm',
    namespace: 'gm',
    method,
    invocation: { kind: 'direct' },
    scope: { context: 'agent', wire: 'agentId' },
    parameters: [
      {
        name: 'agent',
        wire: 'agentId',
        source: 'lookup',
        lookup: 'agent',
        codec: {
          mode: 'strict',
          typeSymbol: '@freddie/freddie-session/types#SessionId',
          schema: agentId,
        },
      },
      {
        name: 'request',
        wire: 'request',
        source: 'json',
        codec: {
          mode: 'strict',
          typeSymbol,
          schema: requestSchema,
        },
      },
    ],
    cancellation: { parameter: 'signal' },
    result: {
      mode: 'strict',
      typeSymbol: '@freddie/freddie-gm-client#gm/result',
      schema: gmResult,
    },
    sourceLocation: { file: 'packages/gm/gm-client/src/index.js', line: 1, column: 1 },
  }
}

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-gm-client',
  descriptors: [
    descriptor('prdAdd', prdAddRequest, '@freddie/freddie-gm-client#gm/prdAdd:request'),
    descriptor('prdResolve', prdResolveRequest, '@freddie/freddie-gm-client#gm/prdResolve:request'),
    descriptor('mutableAdd', mutableAddRequest, '@freddie/freddie-gm-client#gm/mutableAdd:request'),
    descriptor('mutableResolve', mutableResolveRequest, '@freddie/freddie-gm-client#gm/mutableResolve:request'),
    descriptor('transition', transitionRequest, '@freddie/freddie-gm-client#gm/transition:request'),
  ],
}

export default TYPERT_REMOTE
