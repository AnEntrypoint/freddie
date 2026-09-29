/**
 * Client half of the Remote frame-stream carrier: the `remote.$stream` factory.
 *
 * A Typert endpoint that opens a stream answers with an opaque
 * `{ streamId }` handle instead of frames, because freddie's `/api` carrier is
 * unary. This factory turns that handle back into an async iterable by polling
 * `stream/next` and releases it through `stream/close`. It is installed as an
 * own property of `ctx.remote` while the carrier is mounted and deleted when it
 * is disposed, so `typeof remote.$stream !== 'function'` remains the honest
 * answer for a Client that carries unary calls only.
 *
 * @module @freddie/freddie-remote-stream/client
 */

import { REMOTE_STREAM_MAX_POLL_MS } from '../config.js'
import TYPERT_REMOTE from '../typert.remote-client.js'

/** Cordis plugin name. */
export const name = 'remote-stream'
/** Required Client service: the typed Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the carrier's `stream` namespace and install `remote.$stream`.
 * @param {import('@freddie/cordis').Context} ctx - Client root.
 * @returns {Promise<() => Promise<void>>} disposer withdrawing both.
 */
export async function apply(ctx) {
  const remote = ctx.remote
  const disposeMount = await remote.$mount(TYPERT_REMOTE)
  const disposeFactory = installRemoteStream(remote, ctx.get('remote.stream'))
  return async () => {
    disposeFactory()
    await disposeMount()
  }
}

/**
 * Remotes whose `$stream` factory this module installed.
 *
 * Cordis hands out a fresh accessor around a service on every `ctx.remote`
 * read and re-wraps the values read through it, so the installed factory is
 * never `===` the function handed back: identity cannot mark ownership.
 */
const installed = new WeakMap()

/**
 * Install the stream factory on one Client Remote service.
 *
 * The factory is installed only when the carrier's own namespace is mounted:
 * a Client that cannot reach `stream/next` must keep reporting absence rather
 * than hand out streams that fail on the first poll.
 * @param {object} remote - the Client Remote service (`ctx.remote`).
 * @param {object | undefined} namespace - the mounted `stream` namespace service.
 * @returns {() => void} disposer deleting the factory.
 */
export function installRemoteStream(remote, namespace) {
  if (typeof namespace?.next !== 'function' || typeof namespace?.close !== 'function') {
    return () => {}
  }
  if (installed.get(remote) === true || typeof remote.$stream === 'function') return () => {}
  const $stream = /** @type {(options: object) => object} */ (
    /**
     * @param {{ name: string, open: (signal: AbortSignal) => unknown,
     *   ended: (accepted: boolean) => Error, carrierFailed?: () => void }} options -
     *   stream contract supplied by the calling Remote model.
     * @returns {object} an async iterable of frames carrying `dispose()`.
     */
    (options) => createStream(namespace, options)
  )
  remote.$stream = $stream
  installed.set(remote, true)
  return () => {
    if (installed.get(remote) !== true) return
    installed.delete(remote)
    delete remote.$stream
  }
}

/**
 * Open one Client stream over the `stream` namespace.
 * @param {object} namespace - the mounted `stream` namespace service.
 * @param {{ name: string, open: Function, ended: Function, carrierFailed?: Function }} options - stream contract.
 * @returns {object} async iterable of frames carrying `dispose()`.
 */
function createStream(namespace, options) {
  const { name, open, ended, carrierFailed } = options
  const lifetime = new AbortController()
  /** @type {string | undefined} */
  let streamId = undefined
  let disposed = false
  let delivered = 0

  /** Release the Host stream; idempotent, and silent once the Host forgot it. */
  const release = async () => {
    const id = streamId
    if (id === undefined) return
    streamId = undefined
    try {
      await namespace.close({ streamId: id })
    } catch (_carrierGoneHostReclaimsOnIdleTimer) {
    }
  }

  const dispose = async () => {
    if (disposed) return
    disposed = true
    lifetime.abort()
    await release()
  }

  return {
    dispose,
    async *[Symbol.asyncIterator]() {
      if (disposed) return
      try {
        const source = await sourceOf(namespace, name, open, lifetime.signal, (id) => { streamId = id })
        for await (const frame of source) {
          if (disposed) return
          delivered += 1
          yield frame
        }
        const producerFinishedBeforeConsumerReleased = !disposed
        if (producerFinishedBeforeConsumerReleased) throw ended(delivered > 0)
      } catch (error) {
        if (disposed) return
        carrierFailed?.()
        throw error
      } finally {
        lifetime.abort()
        await release()
      }
    },
  }
}

/**
 * Resolve one `open` result to an async iterable of frames.
 *
 * Three shapes reach here: an async iterable composed Client-side, a Remote
 * outcome whose value is an async iterable, and — the reason this carrier
 * exists — a Remote outcome whose value is a Host stream handle.
 * @param {object} namespace - the mounted `stream` namespace service.
 * @param {string} name - diagnostic stream name.
 * @param {Function} open - the caller's opener.
 * @param {AbortSignal} signal - stream lifetime owned by this carrier.
 * @param {(streamId: string) => void} remember - records the handle for release.
 * @returns {Promise<AsyncIterable<unknown>>} the frame source.
 */
async function sourceOf(namespace, name, open, signal, remember) {
  const opened = await open(signal)
  if (opened === null || opened === undefined) {
    throw new Error(`${name} opened no stream`)
  }
  if (typeof opened[Symbol.asyncIterator] === 'function') return opened
  if (opened.ok === false) {
    const error = opened.error ?? {}
    throw failure(error, `${name} was refused: ${String(error.message ?? 'unknown failure')}`)
  }
  if (opened.ok !== true) throw new Error(`${name} opened an unrecognized stream handle`)
  const value = opened.value
  if (typeof value?.[Symbol.asyncIterator] === 'function') return value
  if (typeof value?.streamId === 'string') {
    remember(value.streamId)
    return pollStream(namespace, name, value.streamId, signal)
  }
  throw new Error(`${name} returned no stream id`)
}

/**
 * Pump one Host stream through `stream/next` polls until it finishes, the
 * caller aborts, or the Host forgets it.
 * @param {object} namespace - the mounted `stream` namespace service.
 * @param {string} name - diagnostic stream name.
 * @param {string} id - Host stream handle.
 * @param {AbortSignal} signal - stream lifetime.
 * @returns {AsyncIterable<unknown>} frames as they arrive.
 */
async function* pollStream(namespace, name, id, signal) {
  while (!signal.aborted) {
    const page = await namespace.next({ streamId: id, maxWaitMs: REMOTE_STREAM_MAX_POLL_MS }, signal)
    if (page?.ok === false) {
      const code = page.error?.code
      const hostReclaimedIdleStream = code === 'stream/expired'
      if (hostReclaimedIdleStream) return
      throw failure(page.error ?? {}, `${name} failed: ${String(page.error?.message ?? 'unknown failure')}`)
    }
    if (page?.ok !== true) throw new Error(`${name} poll returned no page`)
    for (const frame of page.value.frames) yield frame
    if (page.value.done === true) return
  }
}

/**
 * @param {{ code?: string, details?: object }} error - a Remote failure body.
 * @param {string} message - caller-visible diagnostic.
 * @returns {Error} the error carrying the Host's code and details through.
 */
function failure(error, message) {
  return Object.assign(new Error(message), { code: error.code ?? 'internal', details: error.details ?? {} })
}

export default { name, inject, apply }
