import { z } from 'zod'

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
  model: {
    services: [
      {
        description: 'Host frame-stream registry: turns in-process async generators into pollable Remote streams.',
        summary: 'Host frame-stream registry.',
        tags: [],
        jsDoc: '/** Owns every in-flight Host frame stream behind the `stream` Remote namespace. */',
        key: 'remoteStream',
        exportName: 'RemoteStreamService',
        members: [
          {
            kind: 'method',
            name: 'next',
            signature: 'async next(request: RemoteStreamNextRequest, signal?: AbortSignal): Promise<RemoteStreamPage>',
            summary: 'Take the next frames from one stream, waiting for them to be produced.',
            jsDoc: '/** Take the next frames from one stream, waiting for them to be produced. */',
          },
          {
            kind: 'method',
            name: 'close',
            signature: 'async close(request: RemoteStreamCloseRequest): Promise<RemoteStreamCloseResult>',
            summary: 'Destroy one stream and release its producer.',
            jsDoc: '/** Destroy one stream and release its producer. */',
          },
        ],
        types: [
          {
            name: 'RemoteStreamNextRequest',
            declaration: 'export interface RemoteStreamNextRequest { readonly streamId: string; readonly maxWaitMs?: number; }',
          },
          {
            name: 'RemoteStreamPage',
            declaration: 'export interface RemoteStreamPage { readonly frames: readonly unknown[]; readonly done: boolean; }',
          },
          {
            name: 'RemoteStreamCloseRequest',
            declaration: 'export interface RemoteStreamCloseRequest { readonly streamId: string; }',
          },
          {
            name: 'RemoteStreamCloseResult',
            declaration: 'export interface RemoteStreamCloseResult { readonly closed: boolean; }',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}
