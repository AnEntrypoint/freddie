/** Hand-owned Typert host manifest for the job Remote namespace. */
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

export const TYPERT = {
  package: '@freddie/freddie-job-controller',
  face: 'host',
  schemas: [],
  invocations: [kill],
  model: {
    services: [
      {
        description: 'Host job Remote owner: mirrors the background-job roster one session can see and stops a job on a human\'s behalf.',
        summary: 'Host job Remote owner over ctx.jobs.',
        tags: [],
        jsDoc: '/** Host job Remote owner: mirrors the background-job roster one session can see and stops a job on a human\'s behalf. */',
        key: 'jobController',
        exportName: 'JobController',
        members: [
          {
            kind: 'method',
            name: 'kill',
            signature: "@Remote('kill') kill(agent: Agent, request: JobKillRequest): JobKillValue",
            summary: 'Kill one job on a human\'s behalf.',
            jsDoc: '/** Kill one background job on a human\'s behalf, recording "cancelled by the user" as its reason. */',
          },
        ],
        types: [
          {
            name: 'JobKillRequest',
            declaration: 'export interface JobKillRequest { readonly jobId: string }',
          },
          {
            name: 'JobKillValue',
            declaration: 'export interface JobKillValue { readonly outcome: "requested" | "already-finished" }',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}

export default TYPERT
