/**
 * Host frame-stream registry.
 *
 * Freddie's `/api` carrier is unary — one POST, one JSON response — so an
 * async generator cannot ride it. This service owns the missing half: a
 * business method registers its generator here and returns an opaque stream
 * id, and the Client pumps frames through `stream/next` polls. Frames stay
 * ordinary JSON, so every boundary check the unary path already applies
 * (`assertJsonValue` in the Gateway) still applies to them.
 *
 * @module @freddie/freddie-remote-stream
 */

import { randomUUID } from 'node:crypto'
import { Remote, TypertLookupFailure, TypertRemoteService } from '@freddie/freddie-typert-protocol'
import {
  REMOTE_STREAM_IDLE_TIMEOUT_MS,
  REMOTE_STREAM_MAX_BUFFERED_FRAMES,
  REMOTE_STREAM_MAX_FRAMES_PER_POLL,
  REMOTE_STREAM_MAX_OPEN_STREAMS,
  REMOTE_STREAM_MAX_POLL_MS,
  REMOTE_STREAM_NAMESPACE,
} from './config.js'

export {
  REMOTE_STREAM_IDLE_TIMEOUT_MS,
  REMOTE_STREAM_MAX_BUFFERED_FRAMES,
  REMOTE_STREAM_MAX_FRAMES_PER_POLL,
  REMOTE_STREAM_MAX_OPEN_STREAMS,
  REMOTE_STREAM_MAX_POLL_MS,
  REMOTE_STREAM_NAMESPACE,
} from './config.js'

/**
 * Open one Host stream.
 * @typedef {object} RemoteStreamOpenOptions
 * @property {AbortSignal} [signal] - external lifetime; its abort destroys the stream.
 * @property {{ parse: (value: unknown) => unknown }} [frame] - frame validator applied
 *   to every produced frame; a rejected frame fails the stream.
 * @property {number} [maxBufferedFrames] - producer pause threshold.
 * @property {number} [idleTimeoutMs] - unpolled lifetime.
 */

/** Owns every in-flight Host frame stream behind the `stream` Remote namespace. */
export class RemoteStreamService extends TypertRemoteService {
  /**
   * @param {import('@freddie/cordis').Context} ctx - Host context.
   */
  constructor(ctx) {
    super(ctx, 'remoteStream', { namespace: REMOTE_STREAM_NAMESPACE })
    /** @type {Map<string, object>} */
    this.streams = new Map()
    ctx.effect(() => () => this.closeAll(), 'remote-stream.closeAll')
  }

  /**
   * Register one generator as a pollable stream and buffer its opening frame.
   *
   * The first frame is awaited before the id is handed out, so a producer that
   * rejects on its first step (unknown session, bad request) surfaces as the
   * opening call's failure instead of the first poll's.
   * @param {string} name - diagnostic name used in logs and stream failures.
   * @param {(signal: AbortSignal) => AsyncIterable<unknown>} factory - producer;
   *   its signal is aborted when the stream is destroyed.
   * @param {RemoteStreamOpenOptions} [options] - lifetime, frame validator, and bounds.
   * @returns {Promise<{ streamId: string }>} the opaque stream handle.
   */
  async open(name, factory, options = {}) {
    if (this.streams.size >= REMOTE_STREAM_MAX_OPEN_STREAMS) {
      throw streamFailure('stream/unavailable', `too many open streams; at most ${String(REMOTE_STREAM_MAX_OPEN_STREAMS)} may be registered`, { name })
    }
    const lifetime = new AbortController()
    const stream = {
      name,
      streamId: randomUUID(),
      lifetime,
      iterator: undefined,
      frames: [],
      drains: [],
      waiters: new Set(),
      inflight: false,
      done: false,
      error: undefined,
      dead: false,
      idleTimer: undefined,
      maxBufferedFrames: options.maxBufferedFrames ?? REMOTE_STREAM_MAX_BUFFERED_FRAMES,
      idleTimeoutMs: options.idleTimeoutMs ?? REMOTE_STREAM_IDLE_TIMEOUT_MS,
      detach: undefined,
    }
    this.streams.set(stream.streamId, stream)
    const external = options.signal
    const onExternalAbort = () => { this.destroy(stream) }
    if (external !== undefined) {
      if (external.aborted) {
        this.destroy(stream)
        throw streamFailure('stream/aborted', `${name} was cancelled before it opened`, { name })
      }
      external.addEventListener('abort', onExternalAbort, { once: true })
      stream.detach = () => { external.removeEventListener('abort', onExternalAbort) }
    }
    try {
      const iterator = factory(lifetime.signal)
      if (iterator?.[Symbol.asyncIterator] === undefined) {
        throw new Error(`${name} producer did not return an async iterable`)
      }
      stream.iterator = iterator[Symbol.asyncIterator]()
      const first = await stream.iterator.next()
      if (first.done !== true) this.enqueue(stream, first.value, options.frame)
      else this.finish(stream)
      void this.pump(stream, options.frame)
    } catch (error) {
      this.destroy(stream)
      throw error
    }
    this.armIdle(stream)
    return { streamId: stream.streamId }
  }

  /**
   * Take the next frames from one stream, waiting for them to be produced.
   * @param {{ streamId: string, maxWaitMs?: number }} request - stream handle and wait bound.
   * @param {AbortSignal} [signal] - poll cancellation owned by the caller.
   * @returns {Promise<{ frames: unknown[], done: boolean }>} buffered frames and
   *   whether the producer has finished with nothing left to deliver.
   */
  async next(request, signal) {
    const stream = this.require(request.streamId)
    if (stream.inflight) {
      throw streamFailure('stream/busy', `${stream.name} already has a poll in flight`, { name: stream.name })
    }
    stream.inflight = true
    this.clearIdle(stream)
    try {
      const wait = Math.min(
        Number.isSafeInteger(request.maxWaitMs) && request.maxWaitMs >= 0
          ? request.maxWaitMs
          : REMOTE_STREAM_MAX_POLL_MS,
        REMOTE_STREAM_MAX_POLL_MS,
      )
      if (stream.frames.length === 0 && stream.error === undefined && !stream.done) {
        await this.waitForFrames(stream, wait, signal)
      }
      if (signal?.aborted === true) return { frames: [], done: false }
      if (stream.error !== undefined) {
        const error = stream.error
        this.destroy(stream)
        throw error
      }
      const frames = stream.frames.splice(0, REMOTE_STREAM_MAX_FRAMES_PER_POLL)
      this.releaseDrains(stream)
      const done = stream.done && stream.frames.length === 0
      if (done) this.destroy(stream)
      return { frames, done }
    } finally {
      stream.inflight = false
      if (!stream.dead) this.armIdle(stream)
    }
  }

  /**
   * Destroy one stream and release its producer.
   * @param {{ streamId: string }} request - stream handle.
   * @returns {Promise<{ closed: boolean }>} whether a live stream was closed.
   */
  async close(request) {
    const stream = this.streams.get(request.streamId)
    if (stream === undefined) return { closed: false }
    this.destroy(stream)
    return { closed: true }
  }

  /**
   * @param {string} streamId - stream handle.
   * @returns {object} the live stream.
   */
  require(streamId) {
    if (typeof streamId !== 'string') {
      throw streamFailure('stream/invalid', 'streamId must be a string', {})
    }
    const stream = this.streams.get(streamId)
    const unknownIdIsIndistinguishableFromExpired = stream === undefined
    if (unknownIdIsIndistinguishableFromExpired) {
      throw streamFailure('stream/expired', 'stream is no longer registered', {})
    }
    return stream
  }

  /**
   * @param {object} stream - registered stream.
   * @param {{ parse: (value: unknown) => unknown } | undefined} frame - frame validator.
   * @returns {Promise<void>} after the producer finishes or fails.
   */
  async pump(stream, frame) {
    try {
      while (!stream.dead) {
        const step = await stream.iterator.next()
        if (step.done === true) break
        await this.enqueue(stream, step.value, frame)
      }
      this.finish(stream)
    } catch (error) {
      this.fail(stream, error)
    }
  }

  /**
   * Validate and buffer one frame, pausing the producer when the buffer is full.
   * @param {object} stream - registered stream.
   * @param {unknown} value - produced frame.
   * @param {{ parse: (value: unknown) => unknown } | undefined} frame - frame validator.
   * @returns {Promise<void>} after the frame is buffered.
   */
  async enqueue(stream, value, frame) {
    let parsed = value
    if (frame !== undefined) {
      try {
        parsed = frame.parse(value)
      } catch (error) {
        throw new Error(`${stream.name} produced a frame its schema rejects: ${String(error)}`, { cause: error })
      }
    }
    stream.frames.push(parsed)
    this.wake(stream)
    if (stream.frames.length < stream.maxBufferedFrames) return
    await this.parkProducerUntilDrainedOrDestroyed(stream)
  }

  /**
   * Backpressure: park the producer rather than buffer without bound.
   * @param {object} stream - registered stream.
   * @returns {Promise<void>} after a poll drains the buffer or the stream is destroyed.
   */
  async parkProducerUntilDrainedOrDestroyed(stream) {
    await new Promise((resolve) => {
      stream.drains.push(resolve)
      if (stream.dead) this.releaseDrains(stream)
    })
  }

  /**
   * @param {object} stream - registered stream.
   * @param {number} milliseconds - maximum wait.
   * @param {AbortSignal} [signal] - poll cancellation.
   * @returns {Promise<void>} after a frame arrives, the wait elapses, or the caller aborts.
   */
  waitForFrames(stream, milliseconds, signal) {
    return new Promise((resolve) => {
      const settle = () => {
        clearTimeout(timer)
        stream.waiters.delete(settle)
        signal?.removeEventListener('abort', settle)
        resolve()
      }
      const timer = setTimeout(settle, milliseconds)
      stream.waiters.add(settle)
      signal?.addEventListener('abort', settle, { once: true })
    })
  }

  /**
   * @param {object} stream - registered stream.
   * @returns {void}
   */
  wake(stream) {
    for (const waiter of [...stream.waiters]) waiter()
  }

  /**
   * @param {object} stream - registered stream.
   * @returns {void}
   */
  releaseDrains(stream) {
    const drains = stream.drains
    stream.drains = []
    for (const drain of drains) drain()
  }

  /**
   * Mark one stream finished; buffered frames are still delivered.
   * @param {object} stream - registered stream.
   * @returns {void}
   */
  finish(stream) {
    if (stream.dead) return
    stream.done = true
    this.wake(stream)
    this.releaseDrains(stream)
  }

  /**
   * Fail one stream; the failure is delivered by the next poll.
   * @param {object} stream - registered stream.
   * @param {unknown} error - producer failure.
   * @returns {void}
   */
  fail(stream, error) {
    if (stream.dead) return
    stream.error = error
    this.wake(stream)
    this.releaseDrains(stream)
  }

  /**
   * @param {object} stream - registered stream.
   * @returns {void}
   */
  armIdle(stream) {
    this.clearIdle(stream)
    stream.idleTimer = setTimeout(() => { this.destroy(stream) }, stream.idleTimeoutMs)
  }

  /**
   * @param {object} stream - registered stream.
   * @returns {void}
   */
  clearIdle(stream) {
    if (stream.idleTimer === undefined) return
    clearTimeout(stream.idleTimer)
    stream.idleTimer = undefined
  }

  /**
   * Destroy one stream: abort its producer, drop its buffer, release every waiter.
   * @param {object} stream - registered stream.
   * @returns {void}
   */
  destroy(stream) {
    if (stream.dead) return
    stream.dead = true
    this.clearIdle(stream)
    stream.detach?.()
    if (this.streams.get(stream.streamId) === stream) this.streams.delete(stream.streamId)
    stream.frames = []
    stream.lifetime.abort()
    void Promise.resolve(stream.iterator?.return?.()).catch(() => {})
    this.wake(stream)
    this.releaseDrains(stream)
  }

  /** @returns {void} */
  closeAll() {
    for (const stream of [...this.streams.values()]) this.destroy(stream)
  }
}

/**
 * @param {string} code - stable failure category.
 * @param {string} message - caller-safe diagnostic.
 * @param {object} details - structured detail.
 * @returns {TypertLookupFailure} the typed failure.
 */
function streamFailure(code, message, details) {
  return new TypertLookupFailure({ code, message, details })
}

Remote('next')(RemoteStreamService.prototype.next, {
  name: 'next',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(RemoteStreamService.prototype)) },
})
Remote('close')(RemoteStreamService.prototype.close, {
  name: 'close',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(RemoteStreamService.prototype)) },
})

export default RemoteStreamService
