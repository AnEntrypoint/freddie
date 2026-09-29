import { Service } from '@freddie/cordis'

const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/

export function isTypertRemoteSegment(value) {
  return value !== '.' && value !== '..' && TYPERT_REMOTE_SEGMENT_PATTERN.test(value)
}

export class TypertLookupFailure extends Error {
  failure

  constructor(failure) {
    super('Typert lookup policy rejected the requested identity')
    this.name = 'TypertLookupFailure'
    this.failure = failure
  }
}

const markers = new WeakMap()

export function bindTypertRemote(service, serviceKey, options = {}) {
  validateName('service key', serviceKey)
  const namespace = options.namespace ?? serviceKey
  validateName('namespace', namespace)
  return Object.freeze({ service, serviceKey, namespace })
}

export class TypertRemoteService extends Service {
  typertRemote

  constructor(ctx, serviceKey, options = {}) {
    super(ctx, serviceKey)
    this.typertRemote = bindTypertRemote(this, this.name, options)
  }
}

export function Remote(methodOrExportName, context) {
  if (typeof methodOrExportName === 'string') {
    validateName('Remote export name', methodOrExportName)
    return function (_method, decoratorContext) {
      addMarkerInitializer(decoratorContext, { kind: 'direct' }, methodOrExportName)
    }
  }
  if (context === undefined) throw new TypeError('typert-protocol: Remote decorator context is missing')
  addMarkerInitializer(context, { kind: 'direct' })
}

export function RemoteScope(key, exportName) {
  validateName('Scope key', key)
  if (exportName !== undefined) validateName('Remote export name', exportName)
  return function (_method, context) {
    addMarkerInitializer(context, { kind: 'context', context: key }, exportName)
  }
}

export function remoteMethods(service) {
  const prototype = Object.getPrototypeOf(service)
  if (prototype === null) return []
  return [...(markers.get(prototype) ?? [])].map(([method, marker]) => ({ method, ...marker }))
}

function addMarkerInitializer(context, invocation, exportName) {
  if (context.private || context.static || typeof context.name !== 'string') {
    throw new TypeError('typert-protocol: Remote decorators require a public instance method with a string name')
  }
  const method = context.name
  context.addInitializer(function () {
    const prototype = Object.getPrototypeOf(this)
    if (prototype === null) {
      throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`)
    }
    mark(prototype, method, invocation, exportName)
  })
}

function mark(prototype, method, invocation, exportName) {
  let table = markers.get(prototype)
  if (table === undefined) {
    table = new Map()
    markers.set(prototype, table)
  }
  const marker = {
    ...(exportName === undefined || exportName === method ? {} : { exportName }),
    invocation: Object.freeze(invocation),
  }
  const current = table.get(method)
  if (current !== undefined) {
    if (current.exportName === marker.exportName && sameInvocation(current.invocation, invocation)) return
    throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`)
  }
  table.set(method, Object.freeze(marker))
}

function sameInvocation(left, right) {
  return left.kind === right.kind
    && (left.kind === 'direct' || (right.kind === 'context' && left.context === right.context))
}

function validateName(subject, value) {
  if (!isTypertRemoteSegment(value)) {
    throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`)
  }
}
