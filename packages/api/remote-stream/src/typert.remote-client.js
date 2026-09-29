import { z } from 'zod'

function descriptor(method, parameters, resultTypeSymbol, resultSchema, cancellation = undefined) {
  return {
    id: `@freddie/freddie-remote-stream#remoteStream/${method}`,
    service: 'remoteStream',
    namespace: 'stream',
    method,
    invocation: { kind: 'direct' },
    parameters,
    ...cancellation === undefined ? {} : { cancellation },
    result: {
      mode: 'strict',
      typeSymbol: resultTypeSymbol,
      schema: resultSchema,
    },
    sourceLocation: { file: 'packages/api/remote-stream/src/index.js', line: 1, column: 1 },
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
  package: '@freddie/freddie-remote-stream',
  descriptors: [
    descriptor('next',
      [jsonParameter('request', z.object({
        'streamId': z.string(),
        'maxWaitMs': z.number().optional(),
      }), '@freddie/freddie-remote-stream#remoteStream/next:request')],
      '@freddie/freddie-remote-stream#remoteStream/next:result',
      z.object({
        'frames': z.array(z.unknown()),
        'done': z.boolean(),
      }),
      { parameter: 'signal' }),
    descriptor('close',
      [jsonParameter('request', z.object({
        'streamId': z.string(),
      }), '@freddie/freddie-remote-stream#remoteStream/close:request')],
      '@freddie/freddie-remote-stream#remoteStream/close:result',
      z.object({ 'closed': z.boolean() })),
  ],
}

export default TYPERT_REMOTE
