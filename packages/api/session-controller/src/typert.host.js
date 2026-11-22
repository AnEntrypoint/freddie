import { z } from 'zod'
import { COMMAND_CODECS } from './command-codecs.js'
import { projectionValues, sessionListValue } from './list-codecs.js'
import { jsonParameter } from './typert-parameter.js'

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
}
