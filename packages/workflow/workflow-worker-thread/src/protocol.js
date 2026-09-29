export const WorkerToHostType = Object.freeze({
  Ready: 'ready',
  Phase: 'phase',
  Log: 'log',
  AgentStart: 'agent-start',
  AgentEnd: 'agent-end',
  ChildStart: 'child-start',
  ChildDispose: 'child-dispose',
  Result: 'result',
})

export const HostToWorkerType = Object.freeze({
  Go: 'go',
  Cancel: 'cancel',
  ChildStarted: 'child-started',
  ChildStartError: 'child-start-error',
  ChildSettled: 'child-settled',
  ChildFailed: 'child-failed',
  ChildDisposed: 'child-disposed',
})
