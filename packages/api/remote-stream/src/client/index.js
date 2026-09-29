import { REMOTE_STREAM_MAX_POLL_MS } from '../config.js'
import TYPERT_REMOTE from '../typert.remote-client.js'

export const name = 'remote-stream'
export const inject = ['remote']

export async function apply(ctx) {
  const remote = ctx.remote
  const disposeMount = await remote.$mount(TYPERT_REMOTE)
  const disposeFactory = installRemoteStream(remote, ctx.get('remote.stream'))
  return async () => {
    disposeFactory()
    await disposeMount()
  }
}

const installed = new WeakMap()

export function installRemoteStream(remote, namespace) {
  if (typeof namespace?.next !== 'function' || typeof namespace?.close !== 'function') {
    return () => {}
  }
  if (installed.get(remote) === true || typeof remote.$stream === 'function') return () => {}
  const $stream = (
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

function createStream(namespace, options) {
  const { name, open, ended, carrierFailed } = options
  const lifetime = new AbortController()
  let streamId = undefined
  let disposed = false
  let delivered = 0

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

function failure(error, message) {
  return Object.assign(new Error(message), { code: error.code ?? 'internal', details: error.details ?? {} })
}

export default { name, inject, apply }
