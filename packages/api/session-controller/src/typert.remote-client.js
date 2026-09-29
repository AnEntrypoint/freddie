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

const searchRequest = z.object({ 'query': z.string() })

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

const projectionsRequest = z.object({ 'sessionId': z.string() })

function descriptor(method, parameters, resultTypeSymbol, resultSchema, cancellation = undefined) {
  return {
    id: `@freddie/freddie-session-controller#sessionController/${method}`,
    service: 'sessionController',
    namespace: 'session',
    method,
    invocation: { kind: 'direct' },
    parameters,
    ...cancellation === undefined ? {} : { cancellation },
    result: {
      mode: 'strict',
      typeSymbol: resultTypeSymbol,
      schema: resultSchema,
    },
    sourceLocation: { file: 'packages/api/session-controller/src/index.js', line: 1, column: 1 },
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

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-session-controller',
  descriptors: [
    descriptor('list', [],
      '@freddie/freddie-session-controller#sessionController/list:result',
      sessionListValue,
      { parameter: 'signal' }),
    descriptor('search',
      [jsonParameter('request', searchRequest,
        '@freddie/freddie-session-controller#sessionController/search:request')],
      '@freddie/freddie-session-controller#sessionController/search:result',
      z.object({
        'items': z.array(z.object({
          'sessionId': z.string(),
          'snippet': z.string(),
        })),
        'hasMore': z.boolean(),
      }),
      { parameter: 'signal' }),
    descriptor('modelCatalog', [],
      '@freddie/freddie-session-controller#sessionController/modelCatalog:result',
      z.object({
        'default': z.object({
          'provider': z.string(),
          'model': z.string(),
          'reasoningEffort': z.string().optional(),
        }),
        'routableProviders': z.array(z.string()),
        'groups': z.array(z.object({
          'id': z.string(),
          'name': z.string(),
          'models': z.array(z.object({
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
          })),
        })),
        'failures': z.array(z.object({
          'id': z.string(),
          'name': z.string(),
          'message': z.string(),
        })),
      })),
    descriptor('page',
      [jsonParameter('request', pageRequest,
        '@freddie/freddie-session-controller#sessionController/page:request')],
      '@freddie/freddie-session-controller#sessionController/page:result',
      z.object({
        'records': z.array(z.object({
          'type': z.literal('event'),
          'event': wireEvent,
        })),
        'hasMore': z.boolean(),
      }),
      { parameter: 'signal' }),
    descriptor('projections',
      [jsonParameter('request', projectionsRequest,
        '@freddie/freddie-session-controller#sessionController/projections:request')],
      '@freddie/freddie-session-controller#sessionController/projections:result',
      z.nullable(projectionBaseline),
      { parameter: 'signal' }),
    descriptor('follow',
      [jsonParameter('request', z.object({
        'address': sessionAddress,
        'maxMessages': z.number().optional(),
        'turnWindow': z.object({
          'minMessages': z.number(),
          'minTurns': z.number(),
        }).optional(),
      }), '@freddie/freddie-session-controller#sessionController/follow:request')],
      '@freddie/freddie-session-controller#sessionController/follow:result',
      z.object({ 'streamId': z.string() }),
      { parameter: 'signal' }),
    descriptor('control', [],
      '@freddie/freddie-session-controller#sessionController/control:result',
      z.object({ 'streamId': z.string() }),
      { parameter: 'signal' }),
    ...COMMAND_CODECS.map(command => descriptor(
      command.method,
      [jsonParameter('request', command.request,
        `@freddie/freddie-session-controller#sessionController/${command.method}:request`)],
      `@freddie/freddie-session-controller#sessionController/${command.method}:result`,
      command.result,
    )),
  ],
}

export default TYPERT_REMOTE
