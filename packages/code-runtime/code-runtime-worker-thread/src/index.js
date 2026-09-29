
import { Worker } from 'node:worker_threads'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Context } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { MAX_TIMER_DELAY_MS } from '@freddie/freddie-timeout'
import { CodeRuntime, DUNDER_MEMBER, PORTABLE_RESERVED_WORDS, RESERVED_BINDING_GLOBALS, RESERVED_ERROR_MEMBERS } from '@freddie/freddie-code-runtime'
import { snapshotJsonValue } from '@freddie/freddie-session'
import { EMPTY_JSON_ARRAY_BYTES, JSON_STRING_QUOTES_BYTES, jsonStringBytesUpTo, jsonValueBytesUpTo, truncateJsonStringBytes } from './output-json.js'
import { decodeWorkerJson, encodeWorkerJson } from './worker-json.js'

const ELU_POLL_INTERVAL_MS = 25

const MIN_OUTPUT_BYTES = 4

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const STRIP_WRAP = { prefix: 'async function __dsh_program__() {\n', suffix: '\n}' }

const WORKER_PATH = fileURLToPath(new URL('./worker.js', import.meta.url))

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function yieldToPollPhase() {
  return new Promise((resume) => { setImmediate(resume) })
}

function ownDeclaredFunction(record, name) {
  return record && Object.hasOwn(record, name) ? record[name] : undefined
}

function waitForPipeDrain(stream) {
  if (stream.readableEnded || stream.destroyed) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      stream.off('end', done)
      stream.off('close', done)
      stream.off('error', done)
      resolve()
    }
    stream.once('end', done)
    stream.once('close', done)
    stream.once('error', done)
    /* v8 ignore next -- this race cannot be scheduled deterministically between the adjacent state check and listener registration. */
    if (stream.readableEnded || stream.destroyed) done()
  })
}

function parseWorkerMessage(raw) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const m = raw
  switch (m.type) {
    case 'call': {
      if (typeof m.id !== 'number' || typeof m.global !== 'string' || typeof m.name !== 'string') return undefined
      return { type: 'call', id: m.id, global: m.global, name: m.name, args: m.args }
    }
    case 'log': {
      if (typeof m.text !== 'string') return undefined
      return { type: 'log', text: m.text }
    }
    case 'output-limit': return { type: 'output-limit' }
    case 'done': {
      if (m.error === undefined) return { type: 'done', ...m.value !== undefined ? { value: m.value } : {} }
      const error = m.error
      if (typeof error !== 'object' || error === null) return undefined
      const { kind, message } = error
      if ((kind !== 'exception' && kind !== 'invalid-output' && kind !== 'output-limit') || typeof message !== 'string') return undefined
      return { type: 'done', error: { kind, message } }
    }
    default: return undefined
  }
}

class OutputLedger {
  bytes = EMPTY_JSON_ARRAY_BYTES
  entries = 0

  constructor(maxBytes) {
    this.maxBytes = maxBytes
  }

  admit(text, sink) {
    const separatorBytes = this.entries > 0 ? 1 : 0
    const stringBytes = jsonStringBytesUpTo(text, this.maxBytes - this.bytes - separatorBytes)
    if (stringBytes === undefined) return false
    this.bytes += stringBytes + separatorBytes
    this.entries += 1
    sink.push(text)
    return true
  }

  success(logs, value) {
    if (value !== undefined && jsonValueBytesUpTo(value, this.maxBytes - this.bytes) === undefined) return this.limit(logs)
    return { logs, ...value !== undefined ? { value } : {} }
  }

  failure(logs, error) {
    if (jsonStringBytesUpTo(error.message, this.maxBytes - this.bytes) === undefined) return this.limit(logs)
    return { logs, error }
  }

  limit(logs) {
    const fullMessage = `outer output exceeded ${this.maxBytes} bytes`
    const asciiMessageBytes = fullMessage.length + JSON_STRING_QUOTES_BYTES
    const retained = []
    let retainedBytes = EMPTY_JSON_ARRAY_BYTES
    const logBudget = this.maxBytes - asciiMessageBytes
    for (const text of logs) {
      const separatorBytes = retained.length > 0 ? 1 : 0
      const availableBytes = logBudget - retainedBytes - separatorBytes
      const stringBytes = jsonStringBytesUpTo(text, availableBytes)
      if (stringBytes !== undefined) {
        retained.push(text)
        retainedBytes += stringBytes + separatorBytes
        continue
      }
      const prefix = truncateJsonStringBytes(text, availableBytes)
      if (prefix.length > 0) {
        const prefixBytes = jsonStringBytesUpTo(prefix, availableBytes)
        /* v8 ignore next -- truncateJsonStringBytes guarantees its returned prefix fits the same budget. */
        if (prefixBytes === undefined) throw new Error('output ledger produced an oversized log prefix')
        retained.push(prefix)
        retainedBytes += prefixBytes + separatorBytes
      }
      break
    }
    const availableMessageBytes = this.maxBytes - retainedBytes
    const message = truncateJsonStringBytes(fullMessage, availableMessageBytes)
    return { logs: retained, error: { kind: 'output-limit', message } }
  }
}

export class WorkerThreadCodeRuntime extends CodeRuntime {
  static Config = z.object({
    computeMs: z.number().default(60_000),
    maxWallMs: z.number().default(600_000),
    maxOutputBytes: z.number().default(67_108_864),
    maxOldGenerationSizeMb: z.number().default(512),
  })

  language = 'typescript'
  isolation = 'worker-thread'

  config
  live = new Set()
  disposed = false

  constructor(ctx, config) {
    super(ctx)
    this.config = config
    for (const [key, value] of Object.entries(this.config)) {
      if (!(Number.isFinite(value) && value > 0)) throw new Error(`freddie-code-runtime-worker-thread: config.${key} must be a positive number, got ${String(value)}`)
    }
    if (!Number.isSafeInteger(this.config.maxOutputBytes) || this.config.maxOutputBytes < MIN_OUTPUT_BYTES) {
      throw new Error(`freddie-code-runtime-worker-thread: config.maxOutputBytes must be a safe integer of at least ${MIN_OUTPUT_BYTES}, got ${String(this.config.maxOutputBytes)}`)
    }
    if (this.config.maxWallMs > MAX_TIMER_DELAY_MS) {
      throw new Error(`freddie-code-runtime-worker-thread: config.maxWallMs must be at most ${MAX_TIMER_DELAY_MS} (Node clamps a longer setTimeout delay to 1ms), got ${String(this.config.maxWallMs)}`)
    }
    ctx.effect(() => () => this.teardown(), 'worker code-runtime teardown')
  }

  async teardown() {
    this.disposed = true
    const runs = [...this.live]
    for (const run of runs) run.settle({ kind: 'abort', message: 'runtime disposed' })
    await Promise.all(runs.map(run => run.finished))
  }

  async run(request) {
    if (this.disposed) throw new Error('freddie-code-runtime-worker-thread: run() after disposal')
    const bindings = this.validateBindings(request)
    if (request.signal?.aborted) {
      return this.failureBeforeWorker({ kind: 'abort', message: String(request.signal.reason) })
    }

    let code
    try {
      const stripped = stripTypeScriptTypes(STRIP_WRAP.prefix + request.program + STRIP_WRAP.suffix)
      code = stripped.slice(STRIP_WRAP.prefix.length, stripped.length - STRIP_WRAP.suffix.length)
    } catch (error) {
      return this.failureBeforeWorker({ kind: 'exception', message: messageOf(error) })
    }

    return await this.execute(request, code, bindings)
  }

  failureBeforeWorker(error) {
    return new OutputLedger(this.config.maxOutputBytes).failure([], error)
  }

  validateBindings(request) {
    const bindings = new Map()
    for (const namespace of request.bindings) {
      if (!IDENTIFIER.test(namespace.global) || PORTABLE_RESERVED_WORDS.has(namespace.global)) {
        throw new Error(`freddie-code-runtime-worker-thread: binding global ${JSON.stringify(namespace.global)} is not a usable identifier`)
      }
      if (RESERVED_BINDING_GLOBALS.has(namespace.global)) {
        throw new Error(`freddie-code-runtime-worker-thread: reserved binding global ${JSON.stringify(namespace.global)}`)
      }
      if (bindings.has(namespace.global)) {
        throw new Error(`freddie-code-runtime-worker-thread: duplicate binding global ${JSON.stringify(namespace.global)}`)
      }
      bindings.set(namespace.global, namespace)
    }

    const errorClassNames = new Set()
    for (const namespace of request.bindings) {
      const descriptor = namespace.errorClass
      if (!descriptor) continue
      if (!IDENTIFIER.test(descriptor.name) || PORTABLE_RESERVED_WORDS.has(descriptor.name)) {
        throw new Error(`freddie-code-runtime-worker-thread: binding error class ${JSON.stringify(descriptor.name)} is not a usable identifier`)
      }
      if (RESERVED_BINDING_GLOBALS.has(descriptor.name)) {
        throw new Error(`freddie-code-runtime-worker-thread: reserved binding global ${JSON.stringify(descriptor.name)}`)
      }
      if (bindings.has(descriptor.name) || errorClassNames.has(descriptor.name)) {
        throw new Error(`freddie-code-runtime-worker-thread: duplicate injected global ${JSON.stringify(descriptor.name)}`)
      }
      const member = descriptor.memberNameProperty
      if (member.length === 0 || RESERVED_ERROR_MEMBERS.has(member) || DUNDER_MEMBER.test(member)) {
        throw new Error(`freddie-code-runtime-worker-thread: binding error member property ${JSON.stringify(descriptor.memberNameProperty)} is not usable`)
      }
      errorClassNames.add(descriptor.name)
    }
    return bindings
  }

  execute(request, code, bindings) {
    const bootData = {
      code,
      namespaces: [...bindings].map(([global, namespace]) => ({
        global,
        names: Object.keys(namespace.functions),
        ...namespace.errorClass ? { errorClass: namespace.errorClass } : {},
      })),
      maxOutputBytes: this.config.maxOutputBytes,
    }
    const worker = new Worker(WORKER_PATH, {
      workerData: bootData,
      env: {},
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: this.config.maxOldGenerationSizeMb },
      stdout: true,
      stderr: true,
    })

    return new Promise((resolve) => {
      let settled = false
      const answered = new Set()
      const logs = []
      const strayLogs = []
      const output = new OutputLedger(this.config.maxOutputBytes)
      let terminalOverride

      const captureStray = (chunk) => {
        /* v8 ignore next -- a second post-overflow chunk races immediate worker termination; the first overflow path is covered. */
        if (terminalOverride !== undefined) return
        const text = chunk.toString('utf8')
        if (!output.admit(text, strayLogs)) {
          const limited = output.limit([...logs, ...strayLogs, text])
          terminalOverride = limited
          finish(limited)
        }
      }
      worker.stdout.on('data', captureStray)
      worker.stderr.on('data', captureStray)

      let finishResolve
      const finished = new Promise((done) => { finishResolve = done })
      const finish = (finalize) => {
        if (settled) return
        settled = true
        clearInterval(eluTimer)
        clearTimeout(wallTimer)
        request.signal?.removeEventListener('abort', onAbort)
        this.live.delete(live)
        void yieldToPollPhase().then(async () => {
          const stdoutDrained = waitForPipeDrain(worker.stdout)
          const stderrDrained = waitForPipeDrain(worker.stderr)
          await Promise.all([worker.terminate(), stdoutDrained, stderrDrained])
          const result = terminalOverride ?? (typeof finalize === 'function' ? finalize() : finalize)
          finishResolve()
          resolve(result)
        })
      }

      const onDone = (message) => {
        if (message.type !== 'done') return
        if (message.error) {
          const error = message.error
          finish(() => output.failure([...logs, ...strayLogs], error))
          return
        }
        if (message.value === undefined) {
          finish(() => output.success([...logs, ...strayLogs]))
          return
        }
        const value = decodeWorkerJson(message.value)
        if (value === undefined) {
          finish(() => output.failure([...logs, ...strayLogs], { kind: 'invalid-output', message: 'program completion must be lossless JSON' }))
        } else {
          finish(() => output.success([...logs, ...strayLogs], value))
        }
      }

      const onCall = (message) => {
        if (message.type !== 'call' || settled) return
        if (answered.has(message.id)) return
        answered.add(message.id)
        const reply = (payload) => {
          if (settled) return
          worker.postMessage(payload)
        }
        const fn = ownDeclaredFunction(bindings.get(message.global)?.functions, message.name)
        if (typeof fn !== 'function') {
          reply({ type: 'reply', id: message.id, ok: false, message: `unknown binding ${JSON.stringify(`${message.global}.${message.name}`)}` })
          return
        }
        const args = decodeWorkerJson(message.args)
        if (args === undefined) {
          reply({ type: 'reply', id: message.id, ok: false, message: 'binding arguments must be lossless JSON' })
          return
        }
        void (async () => {
          try {
            const resolved = await fn(args)
            let value
            try {
              value = snapshotJsonValue(resolved)
            } catch {
              value = undefined
            }
            if (value === undefined) {
              reply({ type: 'reply', id: message.id, ok: false, message: 'binding resolution must be lossless JSON' })
            } else {
              reply({ type: 'reply', id: message.id, ok: true, value: encodeWorkerJson(value) })
            }
          } catch (error) {
            reply({ type: 'reply', id: message.id, ok: false, message: messageOf(error) })
          }
        })()
      }

      worker.on('message', (raw) => {
        const message = parseWorkerMessage(raw)
        if (!message) return
        if (message.type === 'log' && !settled && !output.admit(message.text, logs)) {
          const limited = output.limit([...logs, ...strayLogs, message.text])
          finish(limited)
          return
        }
        if (message.type === 'output-limit' && !settled) {
          const limited = output.limit([...logs, ...strayLogs])
          finish(limited)
          return
        }
        onCall(message)
        onDone(message)
      })
      worker.on('error', (error) => {
        finish(() => output.failure([...logs, ...strayLogs], { kind: 'worker-exit', message: `worker error: ${error.message}` }))
      })
      worker.on('exit', (exitCode) => {
        finish(() => output.failure([...logs, ...strayLogs], { kind: 'worker-exit', message: `worker exited with code ${exitCode} before completing` }))
      })

      const eluTimer = setInterval(() => {
        const elu = worker.performance.eventLoopUtilization()
        if (elu.active > this.config.computeMs) {
          finish(() => output.failure([...logs, ...strayLogs], { kind: 'timeout', message: `compute budget exhausted (${this.config.computeMs}ms busy)` }))
        }
      }, ELU_POLL_INTERVAL_MS)
      const wallTimer = setTimeout(() => {
        finish(() => output.failure([...logs, ...strayLogs], { kind: 'timeout', message: `wall-clock ceiling reached (${this.config.maxWallMs}ms)` }))
      }, this.config.maxWallMs)
      const onAbort = () => {
        finish(() => output.failure([...logs, ...strayLogs], { kind: 'abort', message: String(request.signal?.reason) }))
      }
      request.signal?.addEventListener('abort', onAbort, { once: true })

      const live = {
        worker,
        finished,
        settle: (failure) => { finish(() => output.failure([...logs, ...strayLogs], failure)) },
      }
      this.live.add(live)
    })
  }
}

export default WorkerThreadCodeRuntime
