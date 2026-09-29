import { z } from 'zod'

const PACKAGE = '@freddie/freddie-api-plugin-manager-controller'
const SOURCE = 'packages/api/plugin-manager-controller/src/index.js'
const SERVICE = 'pluginManagerController'
const NAMESPACE = 'pluginManager'

const lock = z.enum(['request-path', 'host-dependents', 'client-dependents', 'not-addressable'])

const entryView = z.strictObject({
  entryId: z.string(),
  lock: lock.nullable(),
  dependents: z.number().int().nonnegative(),
})
const describeView = z.strictObject({ entries: z.array(entryView) })

const switchView = z.strictObject({
  entryId: z.string(),
  disabled: z.boolean(),
  changed: z.boolean(),
})

const setDisabledRequest = z.strictObject({
  id: z.string().min(1).max(256),
  disabled: z.boolean(),
})

const failure = z.strictObject({
  code: z.enum([
    'plugin-manager/unavailable',
    'plugin-manager/unknown-entry',
    'plugin-manager/protected',
    'plugin-manager/write-failed',
  ]),
  message: z.string(),
  entryId: z.string().optional(),
  lock: lock.optional(),
})

function result(value) {
  return z.union([
    z.strictObject({ ok: z.literal(true), value }),
    z.strictObject({ ok: z.literal(false), error: failure }),
  ])
}

function descriptor(method, request, value) {
  return {
    id: `${PACKAGE}#${NAMESPACE}/${method}`,
    service: SERVICE,
    namespace: NAMESPACE,
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
          typeSymbol: `${PACKAGE}#${NAMESPACE}/${method}:request`,
          schema: request,
        },
      }],
    result: {
      mode: 'strict',
      typeSymbol: `${PACKAGE}#${NAMESPACE}/${method}:result`,
      schema: result(value),
    },
    sourceLocation: { file: SOURCE, line: 1, column: 1 },
  }
}

export const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
    descriptor('describe', undefined, describeView),
    descriptor('setDisabled', setDisabledRequest, switchView),
  ],
}

export default TYPERT_REMOTE
