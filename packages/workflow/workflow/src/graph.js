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
 * Record a `workflow/agent-start` event as a graph node.
 * @param graph - owned graph for this run.
 * @param agent - identifying child payload.
 */
export function recordAgentStart(graph, agent) {
  graph.agentsStarted += 1
  graph.nodes.push({
    id: agent.id,
    label: agent.label ?? agent.id,
    phase: agent.phase ?? graph.currentPhase,
    status: 'running',
    startedAt: Date.now(),
    endedAt: undefined,
    stopReason: undefined,
  })
  if (agent.parentId !== undefined) {
    graph.edges.push({ from: agent.parentId, to: agent.id, kind: 'agent' })
  } else if (graph.currentPhase !== undefined) {
    graph.edges.push({ from: `phase:${graph.currentPhase}`, to: agent.id, kind: 'phase' })
  }
}

/**
 * Record a `workflow/agent-end` event onto the matching node.
 * @param graph - owned graph for this run.
 * @param agent - settlement payload.
 */
export function recordAgentEnd(graph, agent) {
  const node = graph.nodes.find((entry) => entry.id === agent.id)
  const stopReason = agent.stopReason ?? 'completed'
  if (node === undefined) {
    graph.nodes.push({
      id: agent.id,
      label: agent.label ?? agent.id,
      phase: agent.phase ?? graph.currentPhase,
      status: stopReason === 'completed' ? 'completed' : stopReason,
      startedAt: Date.now(),
      endedAt: Date.now(),
      stopReason,
    })
    return
  }
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

  /**
   * Snapshot of every currently tracked run.
   * @returns owned graphs, newest first.
   */
  list() {
    return [...this.graphs.values()].reverse()
  }

  /**
   * Snapshot of one run, or undefined when unknown.
   * @param id - workflow run id.
   */
  get(id) {
    return this.graphs.get(id)
  }

  onStart(info) {
    this.graphs.set(info.id, createWorkflowGraph(info))
  }

  onPhase(info, title) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordPhase(graph, title)
  }

  onLog(info, message) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordLog(graph, message)
  }

  onAgentStart(info, agent) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordAgentStart(graph, agent)
  }

  onAgentEnd(info, agent) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordAgentEnd(graph, agent)
  }

  onEnd(info, outcome) {
    const graph = this.graphs.get(info.id)
    if (graph === undefined) return
    recordEnd(graph, outcome)
  }
}
