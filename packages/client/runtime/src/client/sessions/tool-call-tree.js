export const MAX_TOOL_CALL_TREE_DEPTH = 256

function sameReferences(
  left,
  right,
) {
  return left.length === right.length
    && left.every((block, index) => block === right[index])
}

export class ToolCallTree {
  childrenByParent = new Map()
  depthByCall = new Map()
  projectedByCall = new Map()
  revision = 0
  nodesCache = null
  runningCache = null

  reset() {
    this.childrenByParent.clear()
    this.depthByCall.clear()
    this.projectedByCall.clear()
    this.revision++
  }

  apply(event) {
    if (event.type === 'tool/code-dispatch-start') {
      const data = event.data
      const running = {
        callId: data.subCallId,
        name: data.name,
        argsRaw: JSON.stringify(data.arguments),
        turn: 0,
        step: 0,
        time: event.time,
        callView: null,
        subCalls: [],
      }
      const siblings = this.childrenByParent.get(data.parentCallId) ?? []
      if (!this.acceptEdge(data.parentCallId, data.subCallId)) return true
      this.childrenByParent.set(data.parentCallId, [...siblings, running])
      this.revision++
      return true
    }
    if (event.type !== 'tool/code-dispatch') return false
    const data = event.data
    const siblings = this.childrenByParent.get(data.parentCallId) ?? []
    const at = siblings.findIndex(sub => sub.callId === data.subCallId)
    if (at === -1 && !this.acceptEdge(data.parentCallId, data.subCallId)) return true
    const started = at === -1 ? undefined : siblings[at]
    const settled = {
      kind: 'tool-result',
      seq: event.seq,
      time: event.time,
      callId: data.subCallId,
      call: { name: data.name, argsRaw: JSON.stringify(data.arguments) },
      callTime: started?.time ?? null,
      content: data.content,
      isError: data.isError,
      callView: null,
      resultView: null,
      subCalls: [],
    }
    this.childrenByParent.set(
      data.parentCallId,
      at === -1
        ? [...siblings, settled]
        : siblings.map((sub, index) => index === at ? settled : sub),
    )
    this.revision++
    return true
  }

  projectNodes(nodes) {
    if (this.nodesCache?.source === nodes && this.nodesCache.revision === this.revision) {
      return this.nodesCache.value
    }
    const projected = nodes.map((node) => {
      if (node.kind !== 'tool-result') return node
      return this.projectBlock(node)
    })
    const value = sameReferences(nodes, projected) ? nodes : projected
    this.nodesCache = { source: nodes, revision: this.revision, value }
    return value
  }

  projectRunningCalls(calls) {
    if (this.runningCache?.source === calls && this.runningCache.revision === this.revision) {
      return this.runningCache.value
    }
    const projected = calls.map(call => this.projectBlock(call))
    const value = sameReferences(calls, projected) ? calls : projected
    this.runningCache = { source: calls, revision: this.revision, value }
    return value
  }

  projectBlock(block) {
    const children = this.childrenByParent.get(block.callId) ?? block.subCalls
    const projectedChildren = children.map(child => this.projectBlock(child))
    const childValue = sameReferences(children, projectedChildren)
      ? children
      : projectedChildren
    const cached = this.projectedByCall.get(block.callId)
    if (cached?.source === block && sameReferences(cached.children, childValue)) {
      return cached.value
    }
    const value = block.subCalls === childValue
      ? block
      : { ...block, subCalls: childValue }
    this.projectedByCall.set(block.callId, {
      source: block,
      children: childValue,
      value,
    })
    return value
  }

  acceptEdge(parentCallId, subCallId) {
    if (this.wouldCreateCycle(parentCallId, subCallId)) return false
    const pending = [{
      callId: subCallId,
      depth: (this.depthByCall.get(parentCallId) ?? 1) + 1,
    }]
    const updates = new Map()
    for (const candidate of pending) {
      const knownDepth = updates.get(candidate.callId)
        ?? this.depthByCall.get(candidate.callId)
        ?? 1
      if (candidate.depth <= knownDepth) continue
      if (candidate.depth > MAX_TOOL_CALL_TREE_DEPTH) return false
      updates.set(candidate.callId, candidate.depth)
      for (const child of this.childrenByParent.get(candidate.callId) ?? []) {
        pending.push({ callId: child.callId, depth: candidate.depth + 1 })
      }
    }
    for (const [callId, depth] of updates) this.depthByCall.set(callId, depth)
    return true
  }

  wouldCreateCycle(parentCallId, subCallId) {
    if (parentCallId === subCallId) return true
    const pending = [subCallId]
    const visited = new Set(pending)
    for (const callId of pending) {
      for (const child of this.childrenByParent.get(callId) ?? []) {
        if (child.callId === parentCallId) return true
        if (visited.has(child.callId)) continue
        visited.add(child.callId)
        pending.push(child.callId)
      }
    }
    return false
  }
}
