export function createWorkflowGraph(info) {
  return {
    id: info.id,
    name: info.meta.name,
    description: info.meta.description,
    status: 'running',
    startedAt: Date.now(),
    endedAt: undefined,
    currentPhase: undefined,
    phases: Array.isArray(info.meta.phases)
      ? info.meta.phases.map((phase) => ({
        title: phase.title,
        detail: phase.detail,
        enteredAt: undefined,
      }))
      : [],
    nodes: [],
    edges: [],
    logs: [],
    agentsStarted: 0,
    stopReason: undefined,
    error: undefined,
  }
}

export function recordPhase(graph, title) {
  graph.currentPhase = title
  const existing = graph.phases.find((phase) => phase.title === title)
  if (existing === undefined) {
    graph.phases.push({ title, enteredAt: Date.now() })
    return
  }
  if (existing.enteredAt === undefined) existing.enteredAt = Date.now()
}

export function recordLog(graph, message) {
  graph.logs.push({ ts: Date.now(), message: String(message) })
  if (graph.logs.length > 200) graph.logs.shift()
}

export function agentNodeId(agent) {
  if (typeof agent.childId === 'string' && agent.childId.length > 0) return agent.childId
  if (typeof agent.id === 'string' && agent.id.length > 0) return agent.id
  if (typeof agent.seq === 'number' && Number.isFinite(agent.seq)) return `seq:${agent.seq}`
  return undefined
}

export function agentStopReason(agent) {
  if (agent.outcome === 'failed') return 'failed'
  if (agent.outcome === 'cancelled') return 'cancelled'
  if (agent.outcome === 'completed') return 'completed'
  if (typeof agent.stopReason === 'string' && agent.stopReason.length > 0) return agent.stopReason
  return 'completed'
}

function findNode(graph, agent) {
  if (typeof agent.seq === 'number' && Number.isFinite(agent.seq)) {
    const bySeq = graph.nodes.find((entry) => entry.seq === agent.seq)
    if (bySeq !== undefined) return bySeq
  }
  const id = agentNodeId(agent)
  if (id !== undefined) {
    return graph.nodes.find((entry) => entry.id === id)
  }
  return undefined
}

export function recordAgentStart(graph, agent) {
  graph.agentsStarted += 1
  const id = agentNodeId(agent)
  const phase = agent.phase ?? graph.currentPhase
  graph.nodes.push({
    id,
    seq: agent.seq,
    label: agent.label ?? id,
    phase,
    status: 'running',
    startedAt: Date.now(),
    endedAt: undefined,
    stopReason: undefined,
  })
  if (id === undefined) return
  if (agent.parentId !== undefined) {
    graph.edges.push({ from: agent.parentId, to: id, kind: 'agent' })
  } else if (phase !== undefined) {
    graph.edges.push({ from: `phase:${phase}`, to: id, kind: 'phase' })
  }
}

export function recordAgentEnd(graph, agent) {
  const id = agentNodeId(agent)
  const stopReason = agentStopReason(agent)
  const node = findNode(graph, agent)
  if (node === undefined) {
    graph.nodes.push({
      id,
      seq: agent.seq,
      label: agent.label ?? id,
      phase: agent.phase ?? graph.currentPhase,
      status: stopReason === 'completed' ? 'completed' : stopReason,
      startedAt: Date.now(),
      endedAt: Date.now(),
      stopReason,
    })
    return
  }
  if (node.id === undefined) node.id = id
  node.status = stopReason === 'completed' ? 'completed' : stopReason
  node.endedAt = Date.now()
  node.stopReason = stopReason
}

export function recordEnd(graph, outcome) {
  graph.status = outcome.stopReason === 'completed' ? 'completed' : outcome.stopReason
  graph.stopReason = outcome.stopReason
  graph.error = outcome.error
  graph.endedAt = Date.now()
  if (typeof outcome.agentsStarted === 'number') graph.agentsStarted = outcome.agentsStarted
}

function terminalGraph(graph) {
  return graph.status !== 'running'
}

export class WorkflowGraphTracker {
  maxRetainedTerminalGraphs
  graphs = new Map()
  listeners = new Set()

  constructor({ maxRetainedTerminalGraphs = 20 } = {}) {
    this.maxRetainedTerminalGraphs = maxRetainedTerminalGraphs
  }

  list() {
    return [...this.graphs.values()].reverse().map(snapshotGraph)
  }

  get(id) {
    const graph = this.graphs.get(id)
    return graph === undefined ? undefined : snapshotGraph(graph)
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  publish() {
    const snapshots = this.list()
    for (const listener of this.listeners) listener(snapshots)
  }

  onStart(info) {
    this.graphs.set(info.id, createWorkflowGraph(info))
    this.publish()
  }

  onPhase(info, title) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordPhase(graph, title)
    this.publish()
  }

  onLog(info, message) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordLog(graph, message)
    this.publish()
  }

  onAgentStart(info, agent) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordAgentStart(graph, agent)
    this.publish()
  }

  onAgentEnd(info, agent) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordAgentEnd(graph, agent)
    this.publish()
  }

  onEnd(info, outcome) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordEnd(graph, outcome)
    this.pruneTerminalGraphs()
    this.publish()
  }

  pruneTerminalGraphs() {
    const terminalIds = [...this.graphs.values()]
      .filter(terminalGraph)
      .sort((left, right) => (left.endedAt ?? 0) - (right.endedAt ?? 0))
      .map(graph => graph.id)
    for (const id of terminalIds.slice(0, Math.max(0, terminalIds.length - this.maxRetainedTerminalGraphs))) {
      this.graphs.delete(id)
    }
  }
}

function snapshotGraph(graph) {
  return {
    ...graph,
    phases: graph.phases.map(phase => ({ ...phase })),
    nodes: graph.nodes.map(node => ({ ...node })),
    edges: graph.edges.map(edge => ({ ...edge })),
    logs: graph.logs.map(log => ({ ...log })),
  }
}
