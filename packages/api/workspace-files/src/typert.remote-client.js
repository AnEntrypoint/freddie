import { z } from 'zod'

const PACKAGE = '@freddie/freddie-api-workspace-files'
const SOURCE = 'packages/api/workspace-files/src/index.js'

const stat = z.object({
  absolutePath: z.string(),
  version: z.string(),
  bytes: z.number().optional(),
})
const text = z.object({
  absolutePath: z.string(),
  version: z.string(),
  bytes: z.number().optional(),
  offset: z.number(),
  text: z.string(),
  lines: z.number(),
  eof: z.boolean(),
})
const rawBytes = z.object({
  absolutePath: z.string(),
  version: z.string(),
  bytes: z.number().optional(),
  offset: z.number(),
  encoding: z.string(),
  data: z.string(),
  eof: z.boolean(),
})
const directoryEntry = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number().optional(),
})
const listing = z.object({
  path: z.string(),
  entries: z.array(directoryEntry),
  truncated: z.boolean(),
})

const located = z.object({ path: z.string().min(1), sessionId: z.string().optional() })
const readRequest = z.object({
  path: z.string().min(1),
  sessionId: z.string().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
})
const readBytesRequest = z.object({
  path: z.string().min(1),
  sessionId: z.string().optional(),
  offset: z.number().optional(),
  length: z.number().optional(),
})
const listRequest = z.object({ path: z.string().optional(), sessionId: z.string().optional() })

function result(schema) {
  return z.union([
    z.object({ ok: z.literal(true), value: schema }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }).passthrough(),
    }),
  ])
}

function descriptor(method, request, value) {
  return {
    id: `${PACKAGE}#workspaceFiles/${method}`,
    service: 'workspaceFiles',
    namespace: 'workspaceFiles',
    method,
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: {
        mode: 'strict',
        typeSymbol: `${PACKAGE}#workspaceFiles/${method}:request`,
        schema: request,
      },
    }],
    result: {
      mode: 'strict',
      typeSymbol: `${PACKAGE}#workspaceFiles/${method}:result`,
      schema: result(value),
    },
    sourceLocation: { file: SOURCE, line: 1, column: 1 },
  }
}

export const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
    descriptor('stat', located, stat),
    descriptor('read', readRequest, text),
    descriptor('readBytes', readBytesRequest, rawBytes),
    descriptor('list', listRequest, listing),
  ],
}

export default TYPERT_REMOTE
