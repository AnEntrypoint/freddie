import { tmpdir } from 'node:os'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { assertNever } from '@freddie/freddie-llm'
import { snapshotJsonValue } from '@freddie/freddie-session'
import { renderThrown } from './realm.js'
import { HostToWorkerType, WorkerToHostType } from './protocol.js'

export function workerSpawnEnv(
  platform = process.platform,
) {
  const env = {}
  if (platform === 'win32') {
    const tmp = tmpdir()
    env.TMP = tmp
    env.TEMP = tmp
  }
  return env
}

function resolveWorkerSpawn(init) {
  return { entry: fileURLToPath(new URL('./worker.js', import.meta.url)), options: { workerData: init, env: workerSpawnEnv(), execArgv: [] } }
}

export class WorkerRun {
  result
  settleResolve
  settled = false
  terminalClaimed = false
  workerDeathObserved = false
  cancelReason
  graceTimer
  worker
  workerGone = false
  hostStarted = 0
  children = new Map()
  pendingStarts = new Set()
  liveAgents = new Map()
  quiescenceWaiters = []
  controller = new AbortController()
  inputSignal
  inputSignalAbort
  disposed

  constructor(
    ctx,
    subagents,
    id,
    meta,
    parent,
    init,
    provider,
    disposeGraceMs,
    observer,
    signal,
  ) {
    this.ctx = ctx
    this.subagents = subagents
    this.id = id
    this.meta = meta
    this.parent = parent
    this.provider = provider
    this.disposeGraceMs = disposeGraceMs
    this.observer = observer
    this.result = new Promise((resolve) => { this.settleResolve = resolve })
    const { entry, options } = resolveWorkerSpawn(init)
    this.worker = new Worker(entry, options)
    this.worker.on('message', (message) => { this.onMessage(message) })
    this.worker.on('error', (error) => { this.onWorkerDeath(`workflow worker failed: ${renderThrown(error)}`, false) })
    this.worker.on('messageerror', (error) => { this.onWorkerDeath(`workflow worker message failed to deserialize: ${renderThrown(error)}`, false) })
    this.worker.on('exit', (code) => {
      this.workerGone = true
      this.onWorkerDeath(`workflow worker exited before the run settled (exit code ${code})`, true)
    })
    if (signal?.aborted) {
      this.cancel('workflow start signal already aborted')
    } else if (signal !== undefined) {
      const onAbort = () => {
        this.detachInputSignal()
        this.cancel('workflow signal aborted')
      }
      this.inputSignal = signal
      this.inputSignalAbort = onAbort
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  cancel(reason) {
    if (this.settled || this.terminalClaimed || this.cancelReason !== undefined) return
    this.cancelReason = reason ?? 'workflow cancelled'
    this.post(HostToWorkerType.Cancel, { reason: this.cancelReason })
    this.abortChildren(this.cancelReason)
    this.graceTimer = setTimeout(() => {
      this.terminalClaimed = true
      this.endStrandedAgents()
      this.settleResult(this.cancelledResult(this.hostStarted))
      void this.worker.terminate()
    }, this.disposeGraceMs)
    this.graceTimer.unref()
  }

  dispose() {
    if (this.disposed !== undefined) return this.disposed
    const claimed = Promise.withResolvers()
    this.disposed = claimed.promise
    void (async () => {
      this.detachInputSignal()
      this.cancel('workflow disposed')
      this.reapChildren('workflow disposed')
      await Promise.race([
        (async () => {
          await this.result
          await this.childQuiescence()
        })(),
        sleep(this.disposeGraceMs),
      ])
      await this.worker.terminate()
      this.reapChildren('workflow disposed')
    })().then(
      () => { claimed.resolve(undefined) },
      (error) => { claimed.reject(error) },
    )
    return this.disposed
  }

  post(type, payload) {
    if (this.workerGone || this.workerDeathObserved) return
    try {
      this.worker.postMessage({ type, ...payload })
    } catch (error) {
      this.ctx.logger.warn(`workflow-worker-thread: postMessage failed: ${renderThrown(error)}`)
    }
  }

  onMessage(message) {
    if (this.workerDeathObserved) return
    switch (message.type) {
      case WorkerToHostType.Ready:
        this.post(HostToWorkerType.Go, {})
        break
      case WorkerToHostType.Phase:
        if (this.cancelReason === undefined) this.observer.phase(message.title)
        break
      case WorkerToHostType.Log:
        if (this.cancelReason === undefined) this.observer.log(message.message)
        break
      case WorkerToHostType.AgentStart:
        this.liveAgents.set(message.info.seq, message.info)
        this.observer.agentStart(message.info)
        break
      case WorkerToHostType.AgentEnd:
        this.endAgent(message.info)
        break
      case WorkerToHostType.ChildStart:
        this.onChildStart(message.callId, message.request)
        break
      case WorkerToHostType.ChildDispose:
        this.onChildDispose(message.callId)
        break
      case WorkerToHostType.Result:
        this.onResult(message.result)
        break
      default:
        assertNever(message, 'worker-to-host message')
    }
  }

  childAdmissionFailure() {
    if (this.cancelReason !== undefined) {
      return { reason: this.cancelReason, rendered: `workflow run cancelled: ${this.cancelReason}` }
    }
    if (this.workerDeathObserved) {
      return { reason: 'workflow worker gone', rendered: 'workflow worker is no longer available' }
    }
    if (this.terminalClaimed) {
      return { reason: 'workflow settled', rendered: 'workflow run already settled' }
    }
    return undefined
  }

  onChildStart(callId, request) {
    const initialFailure = this.childAdmissionFailure()
    if (initialFailure !== undefined) {
      this.post(HostToWorkerType.ChildStartError, { callId, rendered: initialFailure.rendered })
      return
    }
    this.hostStarted += 1
    const task = this.startChild(callId, request)
    this.pendingStarts.add(task)
    void task.then(
      () => { this.finishPendingStart(task) },
      () => { this.finishPendingStart(task) },
    )
  }

  async startChild(callId, request) {
    let run
    try {
      run = await this.subagents.start(this.provider, {
        prompt: [{ type: 'text', text: request.prompt }],
        parent: this.parent,
        signal: this.controller.signal,
        ...request.schema !== undefined ? { outputSchema: request.schema } : {},
        ...request.provider !== undefined || request.model !== undefined
          ? {
            agentOptions: {
              ...request.provider !== undefined ? { provider: request.provider } : {},
              ...request.model !== undefined ? { model: request.model } : {},
            },
          }
          : {},
      })
    } catch (error) {
      const failure = this.childAdmissionFailure()
      this.post(HostToWorkerType.ChildStartError, {
        callId,
        rendered: failure?.rendered ?? renderThrown(error),
      })
      return
    }
    const failure = this.childAdmissionFailure()
    if (failure !== undefined) {
      this.post(HostToWorkerType.ChildStartError, { callId, rendered: failure.rendered })
      try {
        await run.dispose()
      } catch (error) {
        this.ctx.logger.warn(`workflow-worker-thread: refused child dispose failed: ${renderThrown(error)}`)
      }
      return
    }

    const record = { run }
    this.children.set(callId, record)
    const forwardResult = run.result.then(
      (result) => {
        try {
          const snapshot = snapshotJsonValue({
            output: result.output,
            ...result.structured !== undefined ? { structured: result.structured } : {},
            stopReason: result.stopReason,
          })
          if (snapshot === undefined) throw new TypeError('child result is not losslessly JSON-serializable')
          return () => { this.post(HostToWorkerType.ChildSettled, { callId, result: snapshot }) }
        } catch (error) {
          const rendered = `workflow child result could not cross the worker boundary: ${renderThrown(error)}`
          return () => { this.post(HostToWorkerType.ChildFailed, { callId, rendered }) }
        }
      },
      (error) => {
        const rendered = renderThrown(error)
        return () => { this.post(HostToWorkerType.ChildFailed, { callId, rendered }) }
      },
    )
    this.post(HostToWorkerType.ChildStarted, { callId, childId: run.id })
    void forwardResult.then((forward) => { forward() })
  }

  onChildDispose(callId) {
    const record = this.children.get(callId)
    if (record === undefined) {
      this.post(HostToWorkerType.ChildDisposed, { callId })
      return
    }
    void this.disposeChild(callId, record).then(() => { this.post(HostToWorkerType.ChildDisposed, { callId }) })
  }

  disposeChild(callId, record) {
    if (record.disposal !== undefined) return record.disposal
    record.disposal = Promise.resolve()
      .then(() => record.run.dispose())
      .catch((error) => {
        this.ctx.logger.warn(`workflow-worker-thread: child dispose failed: ${renderThrown(error)}`)
      })
      .then(() => { this.finishChild(callId) })
    return record.disposal
  }

  finishChild(callId) {
    this.children.delete(callId)
    this.notifyChildQuiescence()
  }

  finishPendingStart(task) {
    this.pendingStarts.delete(task)
    this.notifyChildQuiescence()
  }

  notifyChildQuiescence() {
    if (this.children.size !== 0 || this.pendingStarts.size !== 0) return
    for (const waiter of this.quiescenceWaiters.splice(0)) waiter()
  }

  childQuiescence() {
    if (this.children.size === 0 && this.pendingStarts.size === 0) return Promise.resolve()
    return new Promise((resolve) => { this.quiescenceWaiters.push(resolve) })
  }

  reapChildren(reason) {
    this.abortChildren(this.cancelReason ?? reason)
    for (const [callId, record] of [...this.children]) {
      void this.disposeChild(callId, record)
    }
  }

  abortChildren(reason) {
    if (!this.controller.signal.aborted) this.controller.abort(reason)
  }

  onResult(result) {
    if (this.terminalClaimed) return
    const cancellationWasRequested = this.cancelReason !== undefined
    this.terminalClaimed = true
    this.reapChildren('workflow settled')
    if (!cancellationWasRequested) {
      this.settleResult(result)
      return
    }
    if (result.stopReason !== 'cancelled') {
      this.settleResult(this.cancelledResult(result.agentsStarted))
      return
    }
    this.settleResult(result)
  }

  onWorkerDeath(message, isExit) {
    if (!this.workerDeathObserved) {
      this.workerDeathObserved = true
      const outcomeWasClaimed = this.terminalClaimed
      const cancellationWasRequested = this.cancelReason !== undefined
      if (!outcomeWasClaimed) this.terminalClaimed = true
      if (this.children.size > 0 || this.pendingStarts.size > 0) this.reapChildren('workflow worker gone')
      this.endStrandedAgents()
      if (!outcomeWasClaimed) {
        if (cancellationWasRequested) {
          this.settleResult(this.cancelledResult(this.hostStarted))
        } else {
          this.settleResult({ value: null, stopReason: 'error', error: message, agentsStarted: this.hostStarted })
        }
      }
    }
    if (!isExit) return
    for (const [callId, record] of [...this.children]) void this.disposeChild(callId, record)
    this.endStrandedAgents()
  }

  endAgent(end) {
    if (!this.liveAgents.delete(end.seq)) return
    this.observer.agentEnd(end)
  }

  endStrandedAgents() {
    for (const info of [...this.liveAgents.values()]) {
      this.endAgent({ ...info, outcome: 'cancelled' })
    }
  }

  cancelledResult(agentsStarted) {
    const reason = this.cancelReason ?? 'workflow cancelled'
    return { value: null, stopReason: 'cancelled', error: `workflow run cancelled: ${reason}`, agentsStarted }
  }

  detachInputSignal() {
    const signal = this.inputSignal
    const onAbort = this.inputSignalAbort
    if (signal === undefined || onAbort === undefined) return
    this.inputSignal = undefined
    this.inputSignalAbort = undefined
    signal.removeEventListener('abort', onAbort)
  }

  settleResult(result) {
    if (this.settled) return
    this.terminalClaimed = true
    this.settled = true
    this.detachInputSignal()
    clearTimeout(this.graceTimer)
    this.settleResolve(result)
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref()
  })
}
