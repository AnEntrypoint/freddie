/** Hand-owned Typert host manifest for GM graph-edit Remotes. */
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

function invocation(method, requestSchema, typeSymbol) {
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

export const TYPERT = {
  package: '@freddie/freddie-gm-client',
  face: 'host',
  schemas: [],
  invocations: [
    invocation('prdAdd', prdAddRequest, '@freddie/freddie-gm-client#gm/prdAdd:request'),
    invocation('prdResolve', prdResolveRequest, '@freddie/freddie-gm-client#gm/prdResolve:request'),
    invocation('mutableAdd', mutableAddRequest, '@freddie/freddie-gm-client#gm/mutableAdd:request'),
    invocation('mutableResolve', mutableResolveRequest, '@freddie/freddie-gm-client#gm/mutableResolve:request'),
    invocation('transition', transitionRequest, '@freddie/freddie-gm-client#gm/transition:request'),
  ],
  model: {
    services: [
      {
        description: 'Cordis-native gm spool dispatcher. Graph-edit Remotes take an Agent so session.header.cwd is the open workspace.',
        summary: 'Cordis-native gm spool dispatcher.',
        tags: [],
        jsDoc: '/** Cordis-native gm spool dispatcher. Graph-edit Remotes take an Agent so session.header.cwd is the open workspace. */',
        key: 'gm',
        exportName: 'Gm',
        members: [
          {
            kind: 'method',
            name: 'prdAdd',
            signature: "@Remote('prdAdd') prdAdd(agent: Agent, request: GmPrdAddRequest, signal?: AbortSignal): Promise<JsonValue>",
            summary: 'Add or rescope one PRD row.',
            jsDoc: '/** Add or rescope one PRD row in the Agent session workspace. */',
          },
          {
            kind: 'method',
            name: 'prdResolve',
            signature: "@Remote('prdResolve') prdResolve(agent: Agent, request: GmPrdResolveRequest, signal?: AbortSignal): Promise<JsonValue>",
            summary: 'Resolve one PRD row with witness evidence.',
            jsDoc: '/** Resolve one PRD row with non-empty witness evidence. */',
          },
          {
            kind: 'method',
            name: 'mutableAdd',
            signature: "@Remote('mutableAdd') mutableAdd(agent: Agent, request: GmMutableAddRequest, signal?: AbortSignal): Promise<JsonValue>",
            summary: 'Record one typed mutable.',
            jsDoc: '/** Record one typed mutable against a PRD row. */',
          },
          {
            kind: 'method',
            name: 'mutableResolve',
            signature: "@Remote('mutableResolve') mutableResolve(agent: Agent, request: GmMutableResolveRequest, signal?: AbortSignal): Promise<JsonValue>",
            summary: 'Discharge one mutable.',
            jsDoc: '/** Discharge one mutable. witness_text maps to daemon witness_evidence. */',
          },
          {
            kind: 'method',
            name: 'transition',
            signature: "@Remote('transition') transition(agent: Agent, request: GmTransitionRequest, signal?: AbortSignal): Promise<JsonValue>",
            summary: 'Advance the gm session phase.',
            jsDoc: '/** Advance the gm session phase when gates pass. */',
          },
        ],
        types: [
          {
            name: 'GmPrdAddRequest',
            declaration: 'export interface GmPrdAddRequest { readonly id: string; readonly title?: string; readonly subject?: string; readonly acceptance?: string; readonly status?: string; readonly route_family?: string; }',
          },
          {
            name: 'GmPrdResolveRequest',
            declaration: 'export interface GmPrdResolveRequest { readonly id: string; readonly witness_evidence: string; readonly commit_comment?: string; }',
          },
          {
            name: 'GmMutableAddRequest',
            declaration: 'export interface GmMutableAddRequest { readonly id: string; readonly prd_id?: string; readonly obligation_kind?: string; readonly subject?: string; readonly text?: string; }',
          },
          {
            name: 'GmMutableResolveRequest',
            declaration: 'export interface GmMutableResolveRequest { readonly id: string; readonly witness_text: string; }',
          },
          {
            name: 'GmTransitionRequest',
            declaration: 'export interface GmTransitionRequest { readonly to: string; }',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}
