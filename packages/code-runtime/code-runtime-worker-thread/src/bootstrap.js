
import { inspect } from 'node:util'
import { EMPTY_JSON_ARRAY_BYTES, jsonStringBytesUpTo, jsonValueBytesUpTo, truncateJsonStringBytes } from './output-json.js'
import { decodeWorkerJson, encodeWorkerJson, snapshotCodeJsonValue } from './worker-json.js'

const CapturedError = Error
const capturedObjectCreate = Object.create
const capturedObjectDefineProperty = Object.defineProperty

function defineBindingErrorField(error, key, value) {
  const attributes = capturedObjectCreate(null)
  attributes.enumerable = true
  attributes.value = value
  capturedObjectDefineProperty(error, key, attributes)
}

export class LogBuffer {
  bytes = EMPTY_JSON_ARRAY_BYTES
  entries = 0
  truncated = false
  sink
  onLimit
  maxBytes

  constructor(maxBytes, sink, onLimit = () => {}) {
    this.maxBytes = maxBytes
    this.sink = sink
    this.onLimit = onLimit
  }

  push(text) {
    if (this.truncated) return
    const separatorBytes = this.entries > 0 ? 1 : 0
    const availableBytes = this.maxBytes - this.bytes - separatorBytes
    const stringBytes = jsonStringBytesUpTo(text, availableBytes)
    if (stringBytes === undefined) {
      this.truncated = true
      const prefix = truncateJsonStringBytes(text, availableBytes)
      if (prefix.length > 0) {
        const prefixBytes = jsonStringBytesUpTo(prefix, availableBytes)
        /* v8 ignore next -- truncateJsonStringBytes guarantees the returned prefix fits. */
        if (prefixBytes === undefined) throw new CapturedError('worker output ledger produced an oversized log prefix')
        this.bytes += prefixBytes + separatorBytes
        this.entries += 1
        this.sink(prefix)
      }
      this.onLimit()
      return
    }
    this.bytes += stringBytes + separatorBytes
    this.entries += 1
    this.sink(text)
  }

  remainingOutputBytes() {
    return this.maxBytes - this.bytes
  }
}

const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug']

export function makeConsoleShim(logs) {
  const render = (args) =>
    args.map(arg => typeof arg === 'string' ? arg : inspect(arg, INSPECT_OPTIONS)).join(' ')
  const shim = Object.create(null)
  for (const level of CONSOLE_LEVELS) {
    shim[level] = (...args) => { logs.push(render(args)) }
  }
  return shim
}

function writeCallbackAmongOptionalArgs(optionalArgs) {
  return [optionalArgs[0], optionalArgs[1]].find(
    (arg) => typeof arg === 'function',
  )
}

export function captureStreamWrites(logs, stream) {
  // oxlint-disable-next-line typescript/unbound-method
  const original = stream.write
  stream.write = (chunk, ...rest) => {
    logs.push(typeof chunk === 'string' ? chunk : String(chunk))
    const callback = writeCallbackAmongOptionalArgs(rest)
    if (callback) queueMicrotask(() => { callback(null) })
    return true
  }
  return () => { stream.write = original }
}

const INSPECT_OPTIONS = { depth: 4, maxArrayLength: 100, maxStringLength: 10_000 }

export function prepareCompletion(value, remainingOutputBytes, maxOutputBytes = remainingOutputBytes) {
  if (value === undefined) return {}
  let snapshot
  try {
    snapshot = snapshotCodeJsonValue(value)
  } catch {
    snapshot = undefined
  }
  if (snapshot === undefined) {
    return prepareFailure(
      'invalid-output',
      'program completion must be lossless JSON',
      remainingOutputBytes,
      maxOutputBytes,
    )
  }
  if (jsonValueBytesUpTo(snapshot, remainingOutputBytes) === undefined) {
    return outputLimit(maxOutputBytes)
  }
  return { value: encodeWorkerJson(snapshot) }
}

function outputLimit(maxOutputBytes) {
  return { error: { kind: 'output-limit', message: `outer output exceeded ${maxOutputBytes} bytes` } }
}

function prepareFailure(kind, message, remainingOutputBytes, maxOutputBytes) {
  if (jsonStringBytesUpTo(message, remainingOutputBytes) === undefined) return outputLimit(maxOutputBytes)
  return { error: { kind, message } }
}

export function prepareException(error, remainingOutputBytes, maxOutputBytes = remainingOutputBytes) {
  let message
  try {
    const detail = error instanceof CapturedError ? error.stack ?? error.message : error
    message = typeof detail === 'string' ? detail : String(detail)
  } catch {
    message = 'program threw an unrenderable value'
  }
  return prepareFailure('exception', message, remainingOutputBytes, maxOutputBytes)
}

function makeBindingErrorClass(descriptor) {
  return class BindingCallError extends CapturedError {
    constructor(memberName, message) {
      super(message)
      defineBindingErrorField(this, 'name', descriptor.name)
      defineBindingErrorField(this, descriptor.memberNameProperty, memberName)
    }
  }
}

function bindingFailure(errorClass, memberName, message) {
  return errorClass ? new errorClass(memberName, message) : new CapturedError(message)
}

export function makeBindingErrorClasses(data) {
  const classes = new Map()
  for (const namespace of data.namespaces) {
    if (namespace.errorClass) classes.set(namespace.global, makeBindingErrorClass(namespace.errorClass))
  }
  return classes
}

export function wireReplies(port, pending) {
  port.on('message', (message) => {
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.ok) {
      const value = decodeWorkerJson(message.value)
      if (value === undefined) entry.reject(new CapturedError('binding resolution must be lossless JSON'))
      else entry.resolve(value)
    } else {
      entry.reject(new CapturedError(message.message))
    }
  })
}

export function makeNamespaces(
  data,
  port,
  pending,
  nextId,
  errorClasses = makeBindingErrorClasses(data),
) {
  return data.namespaces.map(({ global, names }) => {
    const errorClass = errorClasses.get(global)
    const namespace = Object.create(null)
    for (const name of names) {
      Object.defineProperty(namespace, name, {
        enumerable: true,
        value: (args) => {
          let detached
          try {
            detached = snapshotCodeJsonValue(args)
          } catch {
            detached = undefined
          }
          if (detached === undefined) {
            return Promise.reject(bindingFailure(errorClass, name, 'binding arguments must be lossless JSON'))
          }
          return new Promise((resolve, reject) => {
            const id = nextId.value++
            pending.set(id, {
              resolve,
              reject: (error) => {
                reject(bindingFailure(errorClass, name, error.message))
              },
            })
            try {
              port.postMessage({ type: 'call', id, global, name, args: encodeWorkerJson(detached) })
            } catch (error) {
              pending.delete(id)
              const message = `binding arguments must be structured-cloneable: ${error instanceof CapturedError ? error.message : String(error)}`
              reject(bindingFailure(errorClass, name, message))
            }
          })
        },
      })
    }
    return namespace
  })
}

export async function runWorkerMain(port, data, streams) {
  const logs = new LogBuffer(
    data.maxOutputBytes,
    (text) => { port.postMessage({ type: 'log', text }) },
    () => { port.postMessage({ type: 'output-limit' }) },
  )
  captureStreamWrites(logs, streams.stdout)
  captureStreamWrites(logs, streams.stderr)

  const pending = new Map()
  wireReplies(port, pending)

  const nextId = { value: 1 }
  const errorClasses = makeBindingErrorClasses(data)
  const namespaces = makeNamespaces(data, port, pending, nextId, errorClasses)
  const errorClassParameters = []
  const errorClassValues = []
  for (const namespace of data.namespaces) {
    if (!namespace.errorClass) continue
    errorClassParameters.push(namespace.errorClass.name)
    const errorClass = errorClasses.get(namespace.global)
    /* v8 ignore next -- makeBindingErrorClasses covers every declaration in the same data. */
    if (!errorClass) throw new CapturedError(`missing binding error class for ${namespace.global}`)
    errorClassValues.push(errorClass)
  }
  const consoleShim = makeConsoleShim(logs)

  let done
  try {
    /* v8 ignore next -- the arrow exists only to reach the AsyncFunction constructor; it is never invoked. */
    const AsyncFunction = (async () => {}).constructor
    const fn = new AsyncFunction(
      ...data.namespaces.map(namespace => namespace.global),
      ...errorClassParameters,
      'console',
      `'use strict';\n${data.code}`,
    )
    const value = await fn(...namespaces, ...errorClassValues, consoleShim)
    done = {
      type: 'done',
      ...prepareCompletion(value, logs.remainingOutputBytes(), data.maxOutputBytes),
    }
  } catch (error) {
    done = {
      type: 'done',
      ...prepareException(error, logs.remainingOutputBytes(), data.maxOutputBytes),
    }
  }
  port.postMessage(done)
}
