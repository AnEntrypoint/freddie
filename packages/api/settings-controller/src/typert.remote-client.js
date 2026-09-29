import { z } from 'zod'

const PACKAGE = '@freddie/freddie-api-settings-controller'
const SOURCE = 'packages/api/settings-controller/src/index.js'

const secret = z.object({ path: z.array(z.string()), set: z.boolean() })
const namespace = z.object({
  ns: z.string(),
  schema: z.unknown(),
  value: z.unknown(),
  base: z.unknown().optional(),
  user: z.unknown().optional(),
  applies: z.string(),
  secrets: z.array(secret),
  revision: z.number(),
}).passthrough()
const settingsView = z.object({
  writable: z.boolean(),
  hasDocument: z.boolean(),
  namespaces: z.array(namespace),
})
const credentialInfo = z.object({
  configured: z.boolean(),
  source: z.string().optional(),
  writable: z.boolean(),
}).passthrough()
const credentialView = z.object({ credentials: z.record(z.string(), credentialInfo) })
const empty = z.object({}).passthrough()

const revisionGuard = z.number().optional()
const pathOp = z.object({
  op: z.string(),
  path: z.array(z.string()),
  value: z.unknown().optional(),
}).passthrough()

const updateRequest = z.object({ ns: z.string().min(1), patch: z.unknown(), expectedRevision: revisionGuard })
const replaceRequest = z.object({ ns: z.string().min(1), section: z.unknown(), expectedRevision: revisionGuard })
const mutateRequest = z.object({ ns: z.string().min(1), ops: z.array(pathOp), expectedRevision: revisionGuard })
const refsRequest = z.object({ refs: z.array(z.string()) })
const setRequest = z.object({ ref: z.string(), value: z.string() })
const unsetRequest = z.object({ ref: z.string() })

function result(schema) {
  return z.union([
    z.object({ ok: z.literal(true), value: schema }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }).passthrough(),
    }),
  ])
}

function descriptor(service, namespace, method, request, value) {
  return {
    id: `${PACKAGE}#${namespace}/${method}`,
    service,
    namespace,
    method,
    invocation: { kind: 'direct' },
    parameters: request === undefined
      ? []
      : [{
        name: 'request',
        wire: 'request',
        source: 'json',
        codec: {
          mode: 'strict',
          typeSymbol: `${PACKAGE}#${namespace}/${method}:request`,
          schema: request,
        },
      }],
    result: {
      mode: 'strict',
      typeSymbol: `${PACKAGE}#${namespace}/${method}:result`,
      schema: result(value),
    },
    sourceLocation: { file: SOURCE, line: 1, column: 1 },
  }
}

export const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
    descriptor('settingsController', 'settings', 'describe', undefined, settingsView),
    descriptor('settingsController', 'settings', 'update', updateRequest, namespace),
    descriptor('settingsController', 'settings', 'replace', replaceRequest, namespace),
    descriptor('settingsController', 'settings', 'mutate', mutateRequest, namespace),
    descriptor('credentialsController', 'credentials', 'describe', refsRequest, credentialView),
    descriptor('credentialsController', 'credentials', 'set', setRequest, empty),
    descriptor('credentialsController', 'credentials', 'unset', unsetRequest, empty),
  ],
}

export default TYPERT_REMOTE
