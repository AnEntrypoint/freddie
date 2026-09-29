import { z } from 'zod'

const agentId = z.intersection(z.string(), z.unknown())
const killRequest = z.object({ jobId: z.string() })
const killResult = z.object({
  outcome: z.union([z.literal('requested'), z.literal('already-finished')]),
})

const kill = {
  id: '@freddie/freddie-job-controller#job/kill',
  service: 'jobController',
  namespace: 'job',
  method: 'kill',
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
        typeSymbol: '@freddie/freddie-job-controller#job/kill:request',
        schema: killRequest,
      },
    },
  ],
  result: {
    mode: 'strict',
    typeSymbol: '@freddie/freddie-job-controller#job/kill:result',
    schema: killResult,
  },
  sourceLocation: { file: 'packages/api/job-controller/src/index.js', line: 1, column: 1 },
}

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-job-controller',
  descriptors: [kill],
}

export default TYPERT_REMOTE
