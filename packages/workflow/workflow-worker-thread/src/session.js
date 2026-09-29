import { assertNever } from '@freddie/freddie-llm'
import { HostToWorkerType, WorkerToHostType } from './protocol.js'
import { renderThrown } from './realm.js'
import { WorkflowExecution } from './runtime.js'

/**
 * The worker-side handle for one started child agent, as returned by
 * {@link ChildPort#startAgent}.
 * @typedef {object} ChildHandle
 * @property {string} id - the started child's session id.
 * @property {Promise<object>} result - the child's settled `SubagentResult`-shaped outcome.
 * @property {function(): Promise<void>} dispose
 */

class RpcChildHandle {
  result

  constructor(post, callId, entry, id) {
    this.post = post
    this.callId = callId
    this.entry = entry
    this.id = id
    this.result = entry.settled.promise
  }

  dispose() {
    this.post(WorkerToHostType.ChildDispose, { callId: this.callId })
    return this.entry.disposed.promise
  }
}

/**
 * The worker-side child-RPC bridge {@link WorkflowExecution} drives to start
 * and own children, without importing `@freddie/freddie-agent` into the worker realm.
 * @typedef {object} ChildPort
 * @property {function(object): Promise<ChildHandle>} startAgent
 */

class ChildRpcBridge {
  nextCallId = 0
  pending = new Map()

  constructor(post) {
    this.post = post
  }

  async startAgent(request) {
    this.nextCallId += 1
    const callId = this.nextCallId
    const entry = {
      started: Promise.withResolvers(),
      settled: Promise.withResolvers(),
      disposed: Promise.withResolvers(),
    }
    entry.settled.promise.catch(() => {})
    this.pending.set(callId, entry)
    this.post(WorkerToHostType.ChildStart, { callId, request })
    const childId = await entry.started.promise
    return new RpcChildHandle(this.post, callId, entry, childId)
  }

  onChildStarted(callId, childId) {
    this.pending.get(callId)?.started.resolve(childId)
  }

  onChildStartError(callId, rendered) {
    const entry = this.pending.get(callId)
    this.pending.delete(callId)
    entry?.started.reject(new Error(rendered))
  }

  onChildSettled(callId, result) {
    this.pending.get(callId)?.settled.resolve(result)
  }

  onChildFailed(callId, rendered) {
    this.pending.get(callId)?.settled.reject(new Error(rendered))
  }

  onChildDisposed(callId) {
    const entry = this.pending.get(callId)
    this.pending.delete(callId)
    entry?.disposed.resolve()
  }
}

export function requireParentPort(port) {
  if (port === null) throw new Error('the workflow worker entry must be loaded inside a worker thread (no parentPort)')
  return port
}

export async function runWorkerSession(port, init) {
  const post = (type, payload) => {
    port.postMessage({ type, ...payload })
  }
  const children = new ChildRpcBridge(post)

  const observer = {
    phase: (title) => { post(WorkerToHostType.Phase, { title }) },
    log: (message) => { post(WorkerToHostType.Log, { message }) },
    agentStart: (info) => { post(WorkerToHostType.AgentStart, { info }) },
    agentEnd: (info) => { post(WorkerToHostType.AgentEnd, { info }) },
  }

  let execution
  try {
    execution = new WorkflowExecution(init.meta, init.body, init.args, init.limits, observer, children)
  } catch (error) {
    post(WorkerToHostType.Result, { result: { value: null, stopReason: 'error', error: renderThrown(error), agentsStarted: 0 } })
    return
  }

  const gate = Promise.withResolvers()
  port.on('message', (message) => {
    switch (message.type) {
      case HostToWorkerType.Go:
        gate.resolve()
        break
      case HostToWorkerType.Cancel:
        execution.cancel(message.reason)
        gate.resolve()
        break
      case HostToWorkerType.ChildStarted:
        children.onChildStarted(message.callId, message.childId)
        break
      case HostToWorkerType.ChildStartError:
        children.onChildStartError(message.callId, message.rendered)
        break
      case HostToWorkerType.ChildSettled:
        children.onChildSettled(message.callId, message.result)
        break
      case HostToWorkerType.ChildFailed:
        children.onChildFailed(message.callId, message.rendered)
        break
      case HostToWorkerType.ChildDisposed:
        children.onChildDisposed(message.callId)
        break
      /* v8 ignore next 2 -- closed engine-owned union; the arm only makes adding a message type a compile error */
      default:
        assertNever(message, 'host-to-worker message')
    }
  })

  post(WorkerToHostType.Ready, {})
  await gate.promise
  const result = await execution.drive()
  post(WorkerToHostType.Result, { result })
}
