/** Hand-owned Typert host manifest (Remote RPC schema + reflection metadata). */
import { z } from 'zod'
import { COMMAND_CODECS } from './command-codecs.js'
import { projectionValues, sessionListValue } from './list-codecs.js'

const sessionAddress = z.union([
  z.object({
    'kind': z.literal('session'),
    'sessionId': z.string(),
  }),
  z.object({
    'kind': z.literal('subagent'),
    'parentSessionId': z.string(),
    'childSessionId': z.string(),
    'mode': z.union([z.literal('one-shot'), z.literal('continuable'), z.literal('unknown')]),
  }),
])

const projectionBaseline = z.object({
  'asOfSeq': z.number(),
  'values': projectionValues,
})

const wireEvent = z.object({
  'type': z.string(),
  'seq': z.number(),
  'time': z.number(),
  'data': z.unknown(),
  'ignorable': z.literal(true).optional(),
  'sourceEventSeqs': z.unknown().optional(),
  'surfaceOp': z.unknown().optional(),
})

const modelSelection = z.object({
  'provider': z.string(),
  'model': z.string(),
  'reasoningEffort': z.string().optional(),
})

const modelCatalogModel = z.object({
  'id': z.string(),
  'name': z.string(),
  'description': z.string().optional(),
  'reasoning': z.object({
    'efforts': z.array(z.object({
      'id': z.string(),
      'name': z.string(),
      'description': z.string().optional(),
    })),
    'defaultEffort': z.string().optional(),
  }).optional(),
})

const pageRequest = z.object({
  'address': sessionAddress,
  'throughSeq': z.number(),
  'beforeSeq': z.number().optional(),
  'maxMessages': z.number().optional(),
  'turnWindow': z.object({
    'minMessages': z.number(),
    'minTurns': z.number(),
  }).optional(),
})

const sourceLocation = {
  file: 'packages/api/session-controller/src/index.js',
  line: 1,
  column: 1,
}

function invocation(method, parameters, result, cancellation = undefined) {
  return {
    id: `@freddie/freddie-session-controller#sessionController/${method}`,
    service: 'sessionController',
    namespace: 'session',
    method,
    invocation: { kind: 'direct' },
    parameters,
    ...cancellation === undefined ? {} : { cancellation },
    result,
    sourceLocation,
  }
}

function jsonParameter(name, schema, typeSymbol) {
  return {
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol, schema },
  }
}

function strictResult(typeSymbol, schema) {
  return { mode: 'strict', typeSymbol, schema }
}

function requestSymbol(method) {
  return `@freddie/freddie-session-controller#sessionController/${method}:request`
}

function resultSymbol(method) {
  return `@freddie/freddie-session-controller#sessionController/${method}:result`
}


const COMMAND_DOCS = {
  create: ['SessionCreateRequest', 'SessionCreateValue', 'Create or idempotently adopt one ordinary Session.'],
  rename: ['SessionRenameRequest', 'SessionRenameValue', 'Normalize and append one user-owned Session title.'],
  fork: ['SessionForkRequest', 'SessionForkValue', 'Create one ordinary Session from a completed-turn prefix of another.'],
  prompt: ['SessionPromptRequest', 'SessionPromptValue', 'Deliver one user prompt to a Session\'s Agent.'],
  attachment: ['SessionAttachmentRequest', 'SessionAttachmentValue', 'Read one durable image after proving the Session log references it.'],
  updateQueue: ['SessionUpdateQueueRequest', 'SessionUpdateQueueValue', 'Mutate or redirect one pending Inbox occurrence.'],
  cancel: ['SessionCancelRequest', 'SessionCancelValue', 'Cancel one live Agent turn while retaining pending inbox work.'],
  selectModel: ['SessionSelectModelRequest', 'SessionSelectModelValue', 'Install one Session-local model selection and save it as the default.'],
}

const COMMAND_DECLARATIONS = {
  SessionCreateRequest: 'export interface SessionCreateRequest { readonly sessionId?: string; readonly workspaceId?: string; readonly cwd?: string; readonly agentPreset?: string; }',
  SessionCreateValue: 'export interface SessionCreateValue { readonly sessionId: string; readonly agentPreset?: string; }',
  SessionRenameRequest: 'export interface SessionRenameRequest { readonly sessionId: string; readonly title: string; }',
  SessionRenameValue: 'export interface SessionRenameValue { readonly title: string; readonly seq: number; }',
  SessionForkRequest: 'export interface SessionForkRequest { readonly sessionId: string; readonly atSeq?: number; }',
  SessionForkValue: 'export interface SessionForkValue { readonly sessionId: string; }',
  SessionPromptRequest: 'export interface SessionPromptRequest { readonly sessionId: string; readonly content: readonly { readonly type: string; readonly text?: string; readonly [key: string]: unknown }[]; readonly mode?: string; readonly clientTimeZone?: string; }',
  SessionPromptValue: 'export interface SessionPromptValue { readonly accepted: boolean; }',
  SessionAttachmentRequest: 'export interface SessionAttachmentRequest { readonly sessionId: string; readonly attachmentId: string; }',
  SessionAttachmentValue: 'export interface SessionAttachmentValue { readonly attachment: unknown; readonly data: string; }',
  SessionUpdateQueueRequest: "export interface SessionUpdateQueueRequest { readonly sessionId: string; readonly itemId: string; readonly action: { readonly kind: 'remove' } | { readonly kind: 'steer' } | { readonly kind: 'edit'; readonly content: readonly { readonly type: string; readonly text?: string }[] }; }",
  SessionUpdateQueueValue: 'export interface SessionUpdateQueueValue { readonly accepted: boolean; }',
  SessionCancelRequest: 'export interface SessionCancelRequest { readonly sessionId: string; readonly confirm?: boolean; }',
  SessionCancelValue: 'export interface SessionCancelValue { readonly accepted: boolean; }',
  SessionSelectModelRequest: 'export interface SessionSelectModelRequest { readonly sessionId: string; readonly provider: string; readonly model: string; readonly reasoningEffort?: string; }',
  SessionSelectModelValue: 'export interface SessionSelectModelValue { readonly selected: ModelSelection; }',
}

const COMMAND_MEMBERS = Object.entries(COMMAND_DOCS).map(([name, [request, value, summary]]) => ({
  kind: 'method',
  name,
  signature: `${name}(request: ${request}): Promise<${value}>`,
  summary,
  jsDoc: `/** ${summary} */`,
}))

const COMMAND_TYPES = Object.entries(COMMAND_DECLARATIONS).map(([name, declaration]) => ({ name, declaration }))

export const TYPERT = {
  package: '@freddie/freddie-session-controller',
  face: 'host',
  schemas: [],
  invocations: [
    invocation('list', [], strictResult(
      '@freddie/freddie-session-controller#sessionController/list:result',
      sessionListValue,
    ), { parameter: 'signal' }),
    invocation(
      'search',
      [jsonParameter('request', z.object({ 'query': z.string() }),
        '@freddie/freddie-session-controller#sessionController/search:request')],
      strictResult(
        '@freddie/freddie-session-controller#sessionController/search:result',
        z.object({
          'items': z.array(z.object({
            'sessionId': z.string(),
            'snippet': z.string(),
          })),
          'hasMore': z.boolean(),
        }),
      ),
      { parameter: 'signal' },
    ),
    invocation('modelCatalog', [], strictResult(
      '@freddie/freddie-session-controller#sessionController/modelCatalog:result',
      z.object({
        'default': modelSelection,
        'routableProviders': z.array(z.string()),
        'groups': z.array(z.object({
          'id': z.string(),
          'name': z.string(),
          'models': z.array(modelCatalogModel),
        })),
        'failures': z.array(z.object({
          'id': z.string(),
          'name': z.string(),
          'message': z.string(),
        })),
      }),
    )),
    invocation(
      'page',
      [jsonParameter('request', pageRequest,
        '@freddie/freddie-session-controller#sessionController/page:request')],
      strictResult(
        '@freddie/freddie-session-controller#sessionController/page:result',
        z.object({
          'records': z.array(z.object({
            'type': z.literal('event'),
            'event': wireEvent,
          })),
          'hasMore': z.boolean(),
        }),
      ),
      { parameter: 'signal' },
    ),
    invocation(
      'projections',
      [jsonParameter('request', z.object({ 'sessionId': z.string() }),
        '@freddie/freddie-session-controller#sessionController/projections:request')],
      strictResult(
        '@freddie/freddie-session-controller#sessionController/projections:result',
        z.nullable(projectionBaseline),
      ),
      { parameter: 'signal' },
    ),
    invocation(
      'follow',
      [jsonParameter('request', z.object({
        'address': sessionAddress,
        'maxMessages': z.number().optional(),
        'turnWindow': z.object({
          'minMessages': z.number(),
          'minTurns': z.number(),
        }).optional(),
      }), '@freddie/freddie-session-controller#sessionController/follow:request')],
      strictResult(
        '@freddie/freddie-session-controller#sessionController/follow:result',
        z.object({ 'streamId': z.string() }),
      ),
      { parameter: 'signal' },
    ),
    invocation(
      'control',
      [],
      strictResult(
        '@freddie/freddie-session-controller#sessionController/control:result',
        z.object({ 'streamId': z.string() }),
      ),
      { parameter: 'signal' },
    ),
    ...COMMAND_CODECS.map(command => invocation(
      command.method,
      [jsonParameter('request', command.request, requestSymbol(command.method))],
      strictResult(resultSymbol(command.method), command.result),
    )),
  ],
  model: {
    services: [
      {
        description: 'Session Remote owner: cold reads, live control state, and Agent/Session identity policy.',
        summary: 'Session Remote owner.',
        tags: [],
        jsDoc: '/** Session Remote owner: cold reads, live control state, and Agent/Session identity policy. */',
        key: 'sessionController',
        exportName: 'SessionController',
        members: [
          {
            kind: 'method',
            name: 'list',
            signature: 'async list(signal: AbortSignal): Promise<SessionListValue>',
            summary: 'Read all visible Session rows without resuming an Agent.',
            jsDoc: '/** Read all visible Session rows without resuming an Agent. */',
          },
          {
            kind: 'method',
            name: 'search',
            signature: 'search(request: SessionSearchRequest, signal: AbortSignal): Promise<SessionSearchValue>',
            summary: 'Search visible Session content without resuming an Agent.',
            jsDoc: '/** Search visible Session content without resuming an Agent. */',
          },
          {
            kind: 'method',
            name: 'modelCatalog',
            signature: 'modelCatalog(): Promise<ModelCatalog>',
            summary: 'Describe every currently routable model.',
            jsDoc: '/** Describe every currently routable model for Host-generation selectors. */',
          },
          {
            kind: 'method',
            name: 'page',
            signature: 'page(request: SessionPageRequest, signal: AbortSignal): Promise<SessionPage>',
            summary: 'Read one cold-safe, message-aligned Session history page.',
            jsDoc: '/** Read one cold-safe, message-aligned Session history page. */',
          },
          {
            kind: 'method',
            name: 'projections',
            signature: 'async projections(request: SessionProjectionsRequest, signal: AbortSignal): Promise<SessionProjectionsValue>',
            summary: 'Read all registered projections without activating an Agent.',
            jsDoc: '/** Read all registered projections without activating an Agent. */',
          },
          {
            kind: 'method',
            name: 'follow',
            signature: 'follow(request: SessionFollowRequest, signal: AbortSignal): Promise<SessionStreamHandle>',
            summary: 'Open one Session log stream from its opening or resume cursor.',
            jsDoc: '/** Open one Session log stream from its opening or resume cursor. */',
          },
          {
            kind: 'method',
            name: 'control',
            signature: 'control(signal: AbortSignal): Promise<SessionStreamHandle>',
            summary: 'Open the live-control stream: a complete baseline followed by replacements.',
            jsDoc: '/** Open the live-control stream: a complete baseline followed by replacements. */',
          },
          ...COMMAND_MEMBERS,
        ],
        types: [
          {
            name: 'SessionSummary',
            declaration: 'export interface SessionSummary { readonly agentAvailable: boolean; readonly sessionId: string; readonly updatedAt: number; readonly running: boolean; readonly blank: boolean; readonly errored?: boolean; readonly parentSessionId?: string; readonly origin?: \'subagent\'; readonly cwd?: string; readonly agentPreset?: string; readonly readOnly?: true; readonly extraHome?: string; readonly projections?: SessionProjectionHints; }',
          },
          {
            name: 'SessionProjectionHints',
            declaration: 'export interface SessionProjectionHints { readonly kind: \'cached\' | \'sequenced\'; readonly asOfSeq: number; readonly values: SessionProjectionValues; }',
          },
          {
            name: 'SessionProjectionBaseline',
            declaration: 'export interface SessionProjectionBaseline { readonly asOfSeq: number; readonly values: SessionProjectionValues; }',
          },
          {
            name: 'SessionProjectionValues',
            declaration: 'export type SessionProjectionValues = Readonly<Record<string, unknown>>;',
          },
          {
            name: 'SessionSearchRequest',
            declaration: 'export interface SessionSearchRequest { readonly query: string; }',
          },
          {
            name: 'SessionSearchValue',
            declaration: 'export interface SessionSearchValue { readonly items: readonly SessionSearchItem[]; readonly hasMore: boolean; }',
          },
          {
            name: 'SessionSearchItem',
            declaration: 'export interface SessionSearchItem { readonly sessionId: string; readonly snippet: string; }',
          },
          {
            name: 'ModelCatalog',
            declaration: 'export interface ModelCatalog { readonly default: ModelSelection; readonly routableProviders: readonly string[]; readonly groups: readonly ModelProviderGroup[]; readonly failures: readonly ModelCatalogFailure[]; }',
          },
          {
            name: 'SessionPageRequest',
            declaration: 'export interface SessionPageRequest { readonly address: SessionAddress; readonly throughSeq: number; readonly beforeSeq?: number; readonly maxMessages?: number; readonly turnWindow?: { readonly minMessages: number; readonly minTurns: number; }; }',
          },
          {
            name: 'SessionAddress',
            declaration: 'export type SessionAddress = { readonly kind: \'session\'; readonly sessionId: string } | { readonly kind: \'subagent\'; readonly parentSessionId: string; readonly childSessionId: string; readonly mode: \'one-shot\' | \'continuable\' | \'unknown\' };',
          },
          {
            name: 'SessionPage',
            declaration: 'export interface SessionPage { readonly records: readonly SessionHistoryRecord[]; readonly hasMore: boolean; }',
          },
          {
            name: 'SessionProjectionsRequest',
            declaration: 'export interface SessionProjectionsRequest { readonly sessionId: string; }',
          },
          {
            name: 'SessionProjectionsValue',
            declaration: 'export type SessionProjectionsValue = SessionProjectionBaseline | null;',
          },
          {
            name: 'SessionFollowRequest',
            declaration: 'export interface SessionFollowRequest { readonly address: SessionAddress; readonly maxMessages?: number; readonly turnWindow?: { readonly minMessages: number; readonly minTurns: number; }; }',
          },
          {
            name: 'SessionStreamHandle',
            declaration: 'export interface SessionStreamHandle { readonly streamId: string; }',
          },
          {
            name: 'SessionFollowFrame',
            declaration: "export type SessionFollowFrame = { readonly type: 'snapshot'; readonly header: unknown; readonly cursor: number; readonly records: readonly SessionHistoryRecord[]; readonly hasMore: boolean; readonly projections: SessionProjectionBaseline } | { readonly type: 'event'; readonly event: SessionWireEvent };",
          },
          {
            name: 'SessionControlFrame',
            declaration: "export type SessionControlFrame = { readonly type: 'baseline'; readonly value: SessionProjectionBaseline } | { readonly type: 'projection'; readonly sessionId: string; readonly key: string; readonly value: unknown; readonly seq: number };",
          },
          ...COMMAND_TYPES,
        ],
      },
    ],
    events: [],
    objects: [],
  },
}
