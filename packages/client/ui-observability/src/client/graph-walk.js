/** Pure GM graph layout and JIT/CLI overlay for the Overview walk. */

const GM_NODE_TOOLS = /^(gm_prd_|gm_mutable_)/

function compactText(value) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length === 0) return undefined
  return text.length <= 160 ? text : `${text.slice(0, 157)}…`
}

function graphNodes(gm) {
  return Array.isArray(gm?.nodes) ? gm.nodes.filter(node => typeof node?.id === 'string') : []
}

function graphEdges(gm) {
  return Array.isArray(gm?.edges) ? gm.edges.filter(edge => typeof edge?.from === 'string' && typeof edge?.to === 'string') : []
}

function walkingOf(gm) {
  const walking = gm?.walking
  if (walking === null || typeof walking !== 'object') return null
  return {
    verb: typeof walking.verb === 'string' ? walking.verb : null,
    nodeId: typeof walking.nodeId === 'string' ? walking.nodeId : null,
  }
}

function parseToolId(root) {
  const name = root?.call?.name ?? root?.name
  if (typeof name !== 'string' || !GM_NODE_TOOLS.test(name)) return undefined
  const raw = root?.call?.argsRaw
  if (typeof raw !== 'string') return undefined
  try {
    const args = JSON.parse(raw)
    return typeof args?.id === 'string' ? args.id : undefined
  } catch {
    return undefined
  }
}

function toolLabel(root) {
  const name = root?.call?.name ?? root?.name
  if (typeof name !== 'string' || name === '') return 'Agent operation'
  return name
}

function toolDetail(root) {
  const description = compactText(root?.callView?.description)
  if (description !== undefined) return description
  if (typeof root?.call?.argsRaw !== 'string') return root?.status === 'running' ? 'Running now.' : 'Tool operation completed.'
  try {
    const args = JSON.parse(root.call.argsRaw)
    for (const key of ['description', 'command', 'query', 'path']) {
      const value = compactText(args?.[key])
      if (value !== undefined) return value
    }
  } catch {
    void 0
  }
  return root?.status === 'running' ? 'Running now.' : 'Tool operation completed.'
}

function isRunningTool(root) {
  if (root === undefined || root === null) return false
  if (root.kind === 'tool-result') return false
  if (root.status === 'running') return true
  return root.call !== undefined && root.content === undefined
}

/**
 * Overlay in-flight tool calls and interactive terminals onto graph node ids.
 * @param chatNodes - conversation snapshot nodes.
 * @param terminals - mux-fed terminal snapshots for this session.
 * @param walkingId - node currently being walked, or null.
 * @returns `{ byNode, unmatched }` overlay lists.
 */
export function overlayWalk(chatNodes, terminals, walkingId) {
  const byNode = new Map()
  const unmatched = []
  const push = (nodeId, item) => {
    if (nodeId === null || nodeId === undefined) {
      unmatched.push(item)
      return
    }
    const list = byNode.get(nodeId) ?? []
    list.push(item)
    byNode.set(nodeId, list)
  }
  for (const node of Array.isArray(chatNodes) ? chatNodes : []) {
    if (node == null || node.kind !== 'tool-call') continue
    const root = node.data?.root
    if (!isRunningTool(root)) continue
    const item = { kind: 'jit', key: node.key, label: toolLabel(root), detail: toolDetail(root) }
    push(parseToolId(root) ?? walkingId, item)
  }
  for (const terminal of Array.isArray(terminals) ? terminals : []) {
    if (terminal == null || terminal.status?.kind === 'exited') continue
    const last = typeof terminal.output === 'string' ? compactText(terminal.output.split('\n').at(-1)) : undefined
    push(walkingId, {
      kind: 'cli',
      key: terminal.sessionId,
      label: terminal.name ?? 'terminal',
      detail: last ?? 'Interactive terminal',
    })
  }
  return { byNode, unmatched }
}

function isOpen(status) {
  return status !== 'completed' && status !== 'resolved' && status !== 'witnessed' && status !== 'parked' && status !== 'done'
}

/**
 * Column layout: one column per PRD, mutables stacked under their prdId.
 * @param nodes - graph nodes.
 * @returns columns `{ id, prd, mutables }[]` plus `orphans`.
 */
export function layoutGraph(nodes) {
  const list = Array.isArray(nodes) ? nodes.filter(node => node != null && typeof node.id === 'string') : []
  const prds = list.filter(node => node.kind === 'prd')
  const mutables = list.filter(node => node.kind !== 'prd')
  const used = new Set()
  const columns = prds.map(prd => {
    const children = mutables.filter(node => node.prdId === prd.id)
    for (const child of children) used.add(child.id)
    return { id: prd.id, prd, mutables: children }
  })
  const orphans = mutables.filter(node => !used.has(node.id))
  const openFirst = (left, right) => Number(isOpen(right.status)) - Number(isOpen(left.status))
  columns.sort((left, right) => openFirst(left.prd, right.prd) || left.id.localeCompare(right.id))
  orphans.sort((left, right) => openFirst(left, right) || left.id.localeCompare(right.id))
  return { columns, orphans }
}

/**
 * Inspection payload for page.evaluate — ids/status/verb/names only.
 * @param gm - gmProgress projection.
 * @param overlay - overlayWalk result.
 * @returns JSON-safe debug object.
 */
export function inspectGraph(gm, overlay) {
  const walking = walkingOf(gm)
  const jit = []
  const cli = []
  const collect = (item) => {
    if (item.kind === 'cli') cli.push({ label: item.label })
    else jit.push({ label: item.label })
  }
  const byNode = overlay?.byNode
  const unmatched = Array.isArray(overlay?.unmatched) ? overlay.unmatched : []
  if (byNode != null && typeof byNode.values === 'function') {
    for (const list of byNode.values()) {
      for (const item of Array.isArray(list) ? list : []) collect(item)
    }
  }
  for (const item of unmatched) collect(item)
  return {
    nodes: graphNodes(gm).map(node => ({ id: node.id, kind: node.kind, status: node.status })),
    edges: graphEdges(gm).map(edge => ({ from: edge.from, to: edge.to, kind: edge.kind })),
    walking,
    jit,
    cli,
  }
}

export { graphNodes, graphEdges, walkingOf }
