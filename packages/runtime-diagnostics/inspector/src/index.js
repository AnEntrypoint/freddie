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

export const name = 'inspector'

export const Config = z.object({
  enabled: z.boolean().default(false),
  port: z.natural().max(65_535).default(9_230),
  captureFetch: z.boolean().default(true),
  captureBodies: z.boolean().default(false),
  maxBodyBytes: z.number().step(1).min(1).max(64 * 1024 * 1024).default(DEFAULT_MAX_BODY_BYTES),
  maxJournalBytes: z.number().step(1).min(1).default(DEFAULT_MAX_JOURNAL_BYTES),
  maxRetainedRequests: z.number().step(1).min(1).default(DEFAULT_MAX_RETAINED_REQUESTS),
  maxQueuedRecords: z.number().step(1).min(1).default(DEFAULT_MAX_QUEUED_RECORDS),
  maxQueuedBytes: z.number().step(1).min(1).default(DEFAULT_MAX_QUEUED_BYTES),
  maxFrameBytes: z.number().step(1).min(1).default(DEFAULT_MAX_FRAME_BYTES),
  maxCordisNodes: z.number().step(1).min(1).default(DEFAULT_MAX_CORDIS_NODES),
  cordisIntervalMs: z.number().step(1).min(MIN_CORDIS_INTERVAL_MS).max(MAX_CORDIS_INTERVAL_MS).default(DEFAULT_CORDIS_INTERVAL_MS),
  startupTimeoutMs: z.number().step(1).min(1).max(600_000).default(DEFAULT_STARTUP_TIMEOUT_MS),
  stopTimeoutMs: z.number().step(1).min(1).max(600_000).default(DEFAULT_STOP_TIMEOUT_MS),
})

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

async function stopWorker(worker, timeoutMs) {
  const exited = new Promise((resolve) => { worker.once('exit', () => { resolve() }) })
  worker.postMessage({ t: 'stop' })
  const timer = setTimeout(() => { void worker.terminate() }, timeoutMs)
  timer.unref?.()
  await exited
  clearTimeout(timer)
}
