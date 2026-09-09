/**
 * The host⇄worker wire protocol: one string-valued enum of message tags per direction, a
 * payload map giving each tag its parameters (the single source of truth), and the message
 * unions derived from them. Payloads are plain JSON by construction for structured clone. Both
 * directions are closed engine protocols whose receivers use `assertNever`; generic typed senders
 * make tag/payload mismatches compile-time errors rather than silently skipped messages.
 * @module @freddie/freddie-workflow-worker-thread/protocol
 */

/** Message tags the worker sends the host (the wire values are the tag strings). */
export const WorkerToHostType = Object.freeze({
  /** The startup handshake: the session is listening and awaits {@link HostToWorkerType.Go}. */
  Ready: 'ready',
  /** Observer narration: a `phase(title)` call. */
  Phase: 'phase',
  /** Observer narration: a `log(message)` call. */
  Log: 'log',
  /** Observer lifecycle: one `agent()` call started a child. */
  AgentStart: 'agent-start',
  /** Observer lifecycle: one `agent()` call settled. */
  AgentEnd: 'agent-end',
  /** Child RPC: start a child on the host (answered by ChildStarted or ChildStartError). */
  ChildStart: 'child-start',
  /** Child RPC: dispose a started child (answered by ChildDisposed). */
  ChildDispose: 'child-dispose',
  /** The run's single terminal result. */
  Result: 'result',
})

/** Message tags the host sends the worker (the wire values are the tag strings). */
export const HostToWorkerType = Object.freeze({
  /** Releases the startup gate: run the script body. */
  Go: 'go',
  /** Cancel the run: hooks start throwing and the script dies at its next await. */
  Cancel: 'cancel',
  /** Child RPC reply: the provider fulfilled with a published run (exactly one start reply per ChildStart). */
  ChildStarted: 'child-started',
  /** Child RPC reply: the provider's asynchronous start failed. */
  ChildStartError: 'child-start-error',
  /** Child RPC: a started child's result RESOLVED (its JSON projection). */
  ChildSettled: 'child-settled',
  /** Child RPC: a started child's result REJECTED (an infrastructure fault, rendered). */
  ChildFailed: 'child-failed',
  /** Child RPC reply: a requested disposal completed. */
  ChildDisposed: 'child-disposed',
})
