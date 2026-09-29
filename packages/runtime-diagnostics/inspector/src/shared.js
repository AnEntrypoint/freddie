/**
 * Constants shared by the Host plugin and the Inspector Worker. The Worker runs
 * in a `node:worker_threads` thread of the same package, so both sides import
 * this module rather than duplicating the vocabulary.
 * @module @freddie/freddie-inspector/shared
 */

/**
 * The only address class the CDP endpoint may bind. `Runtime.evaluate` on this
 * target is arbitrary code execution in the Host realm, so the bind is a
 * security constant, not a deployment choice.
 */
export const INSPECTOR_HOST = '127.0.0.1'

/** Every literal bind address the Worker accepts. */
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '::1', 'localhost'])

/** First port the Worker endpoint tries; `0` asks the operating system for one. */
export const DEFAULT_PORT = 9230

/** Observation topics the Host publishes and the Worker consumes. */
export const TOPIC = Object.freeze({
  cordisTree: 'cordis/tree',
  fetchStart: 'fetch/start',
  fetchResponse: 'fetch/response',
  fetchEnd: 'fetch/end',
  fetchError: 'fetch/error',
})

/** Host-to-Worker and Worker-to-Host frame discriminants. */
export const FRAME = Object.freeze({
  records: 'records',
  ready: 'ready',
  failed: 'failed',
})

/** Path prefix of the DevTools target WebSocket. */
export const CDP_PATH_PREFIX = '/devtools/page/'

/** Substitution for every redacted header, query value, userinfo, and body secret. */
export const REDACTED = '[redacted]'
