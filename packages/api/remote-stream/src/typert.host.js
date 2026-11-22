import { z } from 'zod'
import { jsonParameter } from './typert-parameter.js'
import { process } from '@freddie/freddie-runtime/process'

const sourceLocation = {
  file: 'packages/api/remote-stream/src/index.js',
  line: 1,
  column: 1,
}

function invocation(method, parameters, result, cancellation = undefined) {
  return {
    id: `@freddie/freddie-remote-stream#remoteStream/${method}`,
    service: 'remoteStream',
    namespace: 'stream',
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

export const TYPERT = {
  package: '@freddie/freddie-remote-stream',
  face: 'host',
  schemas: [],
  invocations: [
    invocation(
      'next',
      [jsonParameter('request', z.object({
        'streamId': z.string(),
        'maxWaitMs': z.number().optional(),
      }), '@freddie/freddie-remote-stream#remoteStream/next:request')],
      strictResult(
        '@freddie/freddie-remote-stream#remoteStream/next:result',
        z.object({
          'frames': z.array(z.unknown()),
          'done': z.boolean(),
        }),
      ),
      { parameter: 'signal' },
    ),
    invocation(
      'close',
      [jsonParameter('request', z.object({
        'streamId': z.string(),
      }), '@freddie/freddie-remote-stream#remoteStream/close:request')],
      strictResult(
        '@freddie/freddie-remote-stream#remoteStream/close:result',
        z.object({ 'closed': z.boolean() }),
      ),
    ),
  ],
}
