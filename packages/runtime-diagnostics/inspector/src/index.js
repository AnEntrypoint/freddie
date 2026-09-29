/**
 * Host plugin and library entry for the Inspector: a Chrome DevTools target
 * over one Host Cordis realm.
 *
 * Security posture, and why it is stricter than upstream's:
 *
 * - The CDP socket grants arbitrary code execution in the Host realm through
 *   `Runtime.evaluate`, and Debugger operations add pause and resume control.
 *   The endpoint therefore binds loopback only, and there is no configuration
 *   field that widens it: `host` is not part of `Config`, and
 *   {@link resolveInspectorOptions} — which library callers reach directly —
 *   asserts loopback before the Worker spawns and again from the bound socket.
 *   A bind that cannot be made loopback fails the endpoint; it never falls back
 *   to a wider one.
 * - It is opt-in. The base bundle mounts it with `enabled: false` and no bundle
 *   or profile enables it, and `enabled` defaults to `false`: mounting it
 *   without saying so installs nothing and logs the refusal.
 * - Captured fetches are redacted. Upstream records headers, query values, and
 *   bodies verbatim; freddie redacts every credential-bearing header, query
 *   value, and URL userinfo unconditionally, and does not capture bodies at all
 *   unless a composition asks. Nothing captured is written to a log, a mirror,
 *   or a scratch file — the retained journal is Worker memory.
 * @module @freddie/freddie-inspector
 */

import { MessageChannel, Worker } from 'node:worker_threads'
import z from '@freddie/schemastery'
import { collectCordisTree } from './cordis-tree.js'
import { installFetchObserver } from './fetch-capture.js'
import { HostSource } from './host-source.js'
import {
  resolveInspectorOptions,
  DEFAULT_MAX_BODY_BYTES, DEFAULT_MAX_CORDIS_NODES, DEFAULT_MAX_FRAME_BYTES,
  DEFAULT_MAX_JOURNAL_BYTES, DEFAULT_MAX_QUEUED_BYTES, DEFAULT_MAX_QUEUED_RECORDS,
  DEFAULT_MAX_RETAINED_REQUESTS, DEFAULT_STARTUP_TIMEOUT_MS, DEFAULT_STOP_TIMEOUT_MS,
  DEFAULT_CORDIS_INTERVAL_MS, MIN_CORDIS_INTERVAL_MS, MAX_CORDIS_INTERVAL_MS,
} from './options.js'
import { FRAME, TOPIC } from './shared.js'

export { resolveInspectorOptions, assertLoopback } from './options.js'
export { collectCordisTree } from './cordis-tree.js'
export {
  CDP_PATH_PREFIX, DEFAULT_PORT, INSPECTOR_HOST, LOOPBACK_HOSTS, REDACTED, TOPIC,
} from './shared.js'

/** Cordis function-plugin name. */
export const name = 'inspector'

/** @typedef {ReturnType<typeof resolveInspectorOptions>} InspectorSpec */

/**
 * Inspector configuration. There is deliberately no `host` field: the endpoint
 * binds loopback or it does not start.
 */
export const Config = z.object({
  /**
   * Opt-in gate. The CDP target executes arbitrary Host code, so a composition
   * has to ask for it explicitly; a mounted-but-disabled plugin installs
   * nothing and logs the refusal.
   */
  enabled: z.boolean().default(false),
  /** First port the Worker tries; occupied ports advance upward, `0` asks the OS for one. */
  port: z.natural().max(65_535).default(9_230),
  /** Whether to observe calls made through the current global fetch function. */
  captureFetch: z.boolean().default(true),
  /**
   * Whether captured fetches retain request and response bodies. Bodies are the
   * one capture surface redaction cannot make exhaustive, so they stay off
   * until a composition accepts that.
   */
  captureBodies: z.boolean().default(false),
  /** Byte ceiling for one captured body. */
  maxBodyBytes: z.number().step(1).min(1).max(64 * 1024 * 1024).default(DEFAULT_MAX_BODY_BYTES),
  /** Total request and response body bytes the Worker retains. */
  maxJournalBytes: z.number().step(1).min(1).default(DEFAULT_MAX_JOURNAL_BYTES),
  /** Active and completed fetch requests the Worker retains. */
  maxRetainedRequests: z.number().step(1).min(1).default(DEFAULT_MAX_RETAINED_REQUESTS),
  /** Records waiting in one producer queue before the oldest is dropped. */
  maxQueuedRecords: z.number().step(1).min(1).default(DEFAULT_MAX_QUEUED_RECORDS),
  /** Encoded bytes waiting in one producer queue before the oldest is dropped. */
  maxQueuedBytes: z.number().step(1).min(1).default(DEFAULT_MAX_QUEUED_BYTES),
  /** Encoded bytes accepted in one transport frame. */
  maxFrameBytes: z.number().step(1).min(1).default(DEFAULT_MAX_FRAME_BYTES),
  /** Context and Fiber nodes admitted from one realm snapshot before truncation. */
  maxCordisNodes: z.number().step(1).min(1).default(DEFAULT_MAX_CORDIS_NODES),
  /** How often the Host republishes its Cordis snapshot for the Elements panel. */
  cordisIntervalMs: z.number().step(1).min(MIN_CORDIS_INTERVAL_MS).max(MAX_CORDIS_INTERVAL_MS).default(DEFAULT_CORDIS_INTERVAL_MS),
  /** Deadline for the Worker to become ready. */
  startupTimeoutMs: z.number().step(1).min(1).max(600_000).default(DEFAULT_STARTUP_TIMEOUT_MS),
  /** Grace period before a stopping Worker is terminated. */
  stopTimeoutMs: z.number().step(1).min(1).max(600_000).default(DEFAULT_STOP_TIMEOUT_MS),
})

/**
 * Start the Worker, open the Host source, and install fetch capture.
 * @param {object} [options] - resolved or partial Inspector options.
 * @returns {Promise<{
 *   endpoint: { httpUrl: string, webSocketDebuggerUrl: string, devtoolsFrontendUrl: string },
 *   source: import('./host-source.js').HostSource,
 *   close: () => Promise<void>
 * }>} the ready endpoint and its quiescent shutdown handle.
 */
export async function startInspector(options = {}) {
  const spec = resolveInspectorOptions(options)
  const channel = new MessageChannel()
  const worker = new Worker(new URL('./worker.js', import.meta.url), {
    workerData: { config: spec, hostSourcePort: channel.port2 },
    transferList: [channel.port2],
    execArgv: [],
  })

  let ready
  try {
    ready = await waitForReady(worker, spec.startupTimeoutMs)
  } catch (error) {
    channel.port1.close()
    await worker.terminate()
    throw error
  }

  const source = new HostSource(channel.port1, spec)
  let observer
  try {
    observer = spec.captureFetch ? installFetchObserver(source, spec) : undefined
  } catch (error) {
    source.close()
    await worker.terminate()
    throw error
  }

  const authority = `${ready.host}:${String(ready.port)}`
  const endpoint = {
    httpUrl: `http://${authority}/`,
    webSocketDebuggerUrl: `ws://${authority}/devtools/page/${ready.targetId}`,
    devtoolsFrontendUrl: 'devtools://devtools/bundled/devtools_app.html'
      + `?ws=${authority}/devtools/page/${ready.targetId}&panel=elements&noJavaScriptCompletion=true`,
  }

  let closing
  return {
    endpoint,
    source,
    close() {
      closing ??= (async () => {
        await observer?.stop()
        source.close()
        await stopWorker(worker, spec.stopTimeoutMs)
      })()
      return closing
    },
  }
}

/**
 * Mount the Inspector over one Host Cordis realm.
 * @param {import('@freddie/cordis').Context} ctx - Host plugin context.
 * @param {z<Config>} config - validated Inspector configuration.
 * @returns {Promise<void>} settles once the Worker is listening.
 */
export async function apply(ctx, config) {
  if (!config.enabled) {
    ctx.logger.warn(
      'inspector: mounted with enabled=false, so nothing was installed. This surface executes '
      + 'arbitrary Host code over a CDP socket; a composition that wants it must set enabled: true.',
    )
    return
  }
  await ctx.effect(async () => {
    const spec = resolveInspectorOptions(config)
    const handle = await startInspector(spec)
    const disposers = []
    const latest = { tree: undefined }
    try {
      disposers.push(publishCordisTree(ctx, handle.source, spec, latest))
      disposers.push(ctx.provide('inspector', createInspectorService(handle, latest)))
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose()
      await handle.close()
      throw error
    }
    const printEndpointOnConsoleBecauseNoLoggerSinkIsGuaranteedYet = () => {
      console.log(`freddie inspector: ${handle.endpoint.devtoolsFrontendUrl}`)
    }
    printEndpointOnConsoleBecauseNoLoggerSinkIsGuaranteedYet()
    return async () => {
      for (const dispose of disposers.reverse()) dispose()
      await handle.close()
    }
  }, 'inspector: CDP Worker')
}

/**
 * Publish the Cordis snapshot on a timer: `framework/cordis` keeps no
 * tree-change event a consumer can rely on, and a debugger that shows a stale
 * graph is worse than one that polls a cheap projection.
 * @param {import('@freddie/cordis').Context} ctx - Host plugin context.
 * @param {import('./host-source.js').HostSource} source - Host observation source.
 * @param {InspectorSpec} spec - resolved options.
 * @param {{ tree: object | undefined }} latest - holder for the service's read.
 * @returns {() => void} disposer.
 */
function publishCordisTree(ctx, source, spec, latest) {
  if (!Number.isSafeInteger(spec.cordisIntervalMs) || spec.cordisIntervalMs <= 0) {
    throw new Error(`inspector: refusing to publish the Cordis tree on a ${String(spec.cordisIntervalMs)}ms interval; it must be a positive integer`)
  }
  const publish = () => {
    latest.tree = collectCordisTree(ctx.root, spec.maxCordisNodes)
    source.publish(TOPIC.cordisTree, latest.tree)
  }
  publish()
  const timer = setInterval(publish, spec.cordisIntervalMs)
  timer.unref()
  return () => { clearInterval(timer) }
}

/**
 * The `ctx.inspector` façade: read the bound endpoint, publish Host
 * observations, and read the detached Cordis snapshot without creating a CDP
 * session.
 * @param {{ endpoint: object, source: import('./host-source.js').HostSource }} handle -
 *   the running Inspector handle.
 * @param {{ tree: object | undefined }} latest - last published snapshot.
 * @returns {object} the service.
 */
function createInspectorService(handle, latest) {
  return {
    endpoint: handle.endpoint,
    publish(topic, payload) {
      handle.source.publish(topic, payload)
    },
    cordis: {
      getTree() {
        return latest.tree
      },
    },
  }
}

/**
 * Wait for the Worker's readiness frame.
 * @param {Worker} worker - the Inspector Worker.
 * @param {number} timeoutMs - readiness deadline.
 * @returns {Promise<{ host: string, port: number, targetId: string }>} the bound endpoint.
 */
function waitForReady(worker, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      finish(new Error(`inspector: Worker did not become ready within ${String(timeoutMs)}ms`))
    }, timeoutMs)
    const finish = (error) => {
      clearTimeout(timer)
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
      if (error !== undefined) reject(error)
    }
    const onMessage = (value) => {
      if (value !== null && typeof value === 'object' && value.t === FRAME.ready) {
        resolve({ host: value.host, port: value.port, targetId: value.targetId })
        finish()
        return
      }
      if (value !== null && typeof value === 'object' && value.t === FRAME.failed) {
        finish(new Error(`inspector: ${String(value.message)}`))
      }
    }
    const onError = (error) => { finish(error instanceof Error ? error : new Error(String(error))) }
    const onExit = (code) => { finish(new Error(`inspector: Worker exited with code ${String(code)} before becoming ready`)) }
    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
  })
}

/**
 * Ask the Worker to stop, then terminate it if the grace period expires.
 * @param {Worker} worker - the Inspector Worker.
 * @param {number} timeoutMs - graceful shutdown deadline.
 * @returns {Promise<void>} settles once the Worker is gone.
 */
async function stopWorker(worker, timeoutMs) {
  const exited = new Promise((resolve) => { worker.once('exit', () => { resolve() }) })
  worker.postMessage({ t: 'stop' })
  const timer = setTimeout(() => { void worker.terminate() }, timeoutMs)
  timer.unref?.()
  await exited
  clearTimeout(timer)
}
