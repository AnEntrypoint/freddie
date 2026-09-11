/**
 * Leaf-only graph of one workflow run. Listeners and UI consume this owned
 * snapshot; it never holds live fibers, workers, or Cordis objects.
 * @module @freddie/freddie-workflow/graph
 */

/**
 * Empty graph for a run that has not yet started any children.
 * @param info - identifying run detail from `workflow/start`.
 * @returns a serializable graph.
 */
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

/**
 * Record a `workflow/phase` event.
 * @param graph - owned graph for this run.
 * @param title - phase title from the script.
 */
export function recordPhase(graph, title) {
  graph.currentPhase = title
  const existing = graph.phases.find((phase) => phase.title === title)
  if (existing === undefined) {
    graph.phases.push({ title, enteredAt: Date.now() })
    return
  }
  if (existing.enteredAt === undefined) existing.enteredAt = Date.now()
}

/**
 * Record a `workflow/log` event as a bounded leaf.
 * @param graph - owned graph for this run.
 * @param message - script log line.
 */
export function recordLog(graph, message) {
  graph.logs.push({ ts: Date.now(), message: String(message) })
  if (graph.logs.length > 200) graph.logs.shift()
}

/**
 * Stable node id for one `agent()` call. The worker emits `childId`/`seq`;
 * older payloads used `id`.
 * @param agent - identifying or settlement payload.
 */
export function agentNodeId(agent) {
  if (typeof agent.childId === 'string' && agent.childId.length > 0) return agent.childId
  if (typeof agent.id === 'string' && agent.id.length > 0) return agent.id
  if (typeof agent.seq === 'number' && Number.isFinite(agent.seq)) return `seq:${agent.seq}`
  return undefined
}

/**
 * Map a live `outcome` or legacy `stopReason` onto a graph node status.
 * @param agent - settlement payload.
 */
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

/**
 * Record a `workflow/agent-start` event as a graph node.
 * @param graph - owned graph for this run.
 * @param agent - identifying child payload.
 */
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

/**
 * Record a `workflow/agent-end` event onto the matching node.
 * @param graph - owned graph for this run.
 * @param agent - settlement payload.
 */
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

/**
 * Record a `workflow/end` event.
 * @param graph - owned graph for this run.
 * @param outcome - settlement without the live result value.
 */
export function recordEnd(graph, outcome) {
  graph.status = outcome.stopReason === 'completed' ? 'completed' : outcome.stopReason
  graph.stopReason = outcome.stopReason
  graph.error = outcome.error
  graph.endedAt = Date.now()
  if (typeof outcome.agentsStarted === 'number') graph.agentsStarted = outcome.agentsStarted
}

/**
 * Live graph tracker keyed by run id. Stores only owned snapshots.
 */
export class WorkflowGraphTracker {
  graphs = new Map()
  listeners = new Set()

  /**
   * Snapshot of every currently tracked run.
   * @returns independent serializable graphs, newest first.
   */
  list() {
    return [...this.graphs.values()].reverse().map(snapshotGraph)
  }

  /**
   * Snapshot of one run, or undefined when unknown.
   * @param id - workflow run id.
   * @returns an independent serializable graph.
   */
  get(id) {
    const graph = this.graphs.get(id)
    return graph === undefined ? undefined : snapshotGraph(graph)
  }

  /**
   * Subscribe to immutable graph snapshots after each accepted lifecycle event.
   * @param listener - receives an independent graph snapshot.
   * @returns disposer.
   */
  subscribe(listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  publish(id) {
    const graph = this.graphs.get(id)
    if (graph === undefined) return
    const snapshot = snapshotGraph(graph)
    for (const listener of this.listeners) listener(snapshot)
  }

  onStart(info) {
    this.graphs.set(info.id, createWorkflowGraph(info))
    this.publish(info.id)
  }

  onPhase(info, title) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordPhase(graph, title)
    this.publish(info.id)
  }

  onLog(info, message) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordLog(graph, message)
    this.publish(info.id)
  }

  onAgentStart(info, agent) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordAgentStart(graph, agent)
    this.publish(info.id)
  }

  onAgentEnd(info, agent) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordAgentEnd(graph, agent)
    this.publish(info.id)
  }

  onEnd(info, outcome) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordEnd(graph, outcome)
    this.publish(info.id)
  }
}

/** Create the smallest independent graph snapshot observers may retain. */
function snapshotGraph(graph) {
  return {
    ...graph,
    phases: graph.phases.map(phase => ({ ...phase })),
    nodes: graph.nodes.map(node => ({ ...node })),
    edges: graph.edges.map(edge => ({ ...edge })),
    logs: graph.logs.map(log => ({ ...log })),
  }
}
