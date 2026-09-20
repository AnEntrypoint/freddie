/**
 * Fold daemon-settled GM verb JSON into a bounded PRD/mutable graph snapshot.
 * Instruction lists refresh when they are not truncated; prd/mutable add/resolve
 * bodies upsert even when the response is only `{added}` / `{resolved}`.
 * @module @freddie/freddie-tool-gm/graph
 */

const MAX_GRAPH_NODES = 80

function asRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value
}

function compact(value) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length === 0) return undefined
  return text.length <= 160 ? text : `${text.slice(0, 157)}…`
}

function nodeId(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function prdNode(row, previous) {
  const id = nodeId(row?.id)
  if (id === undefined) return undefined
  const prior = previous.get(id)
  return {
    id,
    kind: 'prd',
    title: compact(row.title) ?? prior?.title ?? id,
    subject: compact(row.subject) ?? prior?.subject ?? null,
    status: typeof row.status === 'string' ? row.status : prior?.status ?? 'pending',
    obligationKind: null,
    prdId: null,
    routeFamily: typeof row.route_family === 'string' ? row.route_family : prior?.routeFamily ?? null,
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on.filter(item => typeof item === 'string') : prior?.dependsOn ?? [],
  }
}

function mutableNode(row, previous) {
  const id = nodeId(row?.id)
  if (id === undefined) return undefined
  const prior = previous.get(id)
  return {
    id,
    kind: 'mutable',
    title: compact(row.subject) ?? compact(row.text) ?? prior?.title ?? id,
    subject: compact(row.text) ?? prior?.subject ?? null,
    status: typeof row.status === 'string' ? row.status : prior?.status ?? 'pending',
    obligationKind: typeof row.obligation_kind === 'string' ? row.obligation_kind : prior?.obligationKind ?? null,
    prdId: nodeId(row.prd_id) ?? prior?.prdId ?? null,
    routeFamily: null,
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on.filter(item => typeof item === 'string') : prior?.dependsOn ?? [],
  }
}

function upsert(map, node) {
  if (node === undefined) return
  map.set(node.id, node)
}

function dropKind(map, kind) {
  for (const [id, node] of map) {
    if (node.kind === kind) map.delete(id)
  }
}

function isOpenStatus(status) {
  return status !== 'completed' && status !== 'resolved' && status !== 'witnessed' && status !== 'parked' && status !== 'done'
}

function capNodes(nodes, walkingId) {
  if (nodes.length <= MAX_GRAPH_NODES) return nodes
  const walking = nodes.find(node => node.id === walkingId)
  const rest = nodes.filter(node => node.id !== walkingId)
  const pending = rest.filter(node => isOpenStatus(node.status))
  const others = rest.filter(node => !pending.includes(node))
  return [...walking === undefined ? [] : [walking], ...pending, ...others].slice(0, MAX_GRAPH_NODES)
}

function edgesFrom(nodes) {
  const ids = new Set(nodes.map(node => node.id))
  const edges = []
  const seen = new Set()
  const push = (from, to, kind) => {
    const key = `${kind}:${from}->${to}`
    if (seen.has(key) || !ids.has(from) || !ids.has(to) || from === to) return
    seen.add(key)
    edges.push({ from, to, kind })
  }
  for (const node of nodes) {
    if (node.kind === 'mutable' && node.prdId !== null) push(node.prdId, node.id, 'prd')
    for (const dep of node.dependsOn ?? []) push(dep, node.id, 'depends')
  }
  return edges
}

/**
 * Accumulate graph nodes and edges from one GM dispatch plus the prior snapshot.
 * @param previous - last gmProgress snapshot, or undefined.
 * @param dispatch - verb, lifecycle status, and optional request body.
 * @param data - daemon `data` object from a settled response (empty while running).
 * @returns `{ nodes, edges, walking }`.
 */
export function foldGmGraph(previous, dispatch, data) {
  const map = new Map()
  for (const node of Array.isArray(previous?.nodes) ? previous.nodes : []) {
    if (typeof node?.id === 'string') map.set(node.id, node)
  }
  if (Array.isArray(data.prd_items)) {
    if (data.prd_items_truncated !== true) dropKind(map, 'prd')
    for (const row of data.prd_items) upsert(map, prdNode(row, map))
  }
  if (Array.isArray(data.mutables_pending)) {
    if (data.mutables_pending_truncated !== true) dropKind(map, 'mutable')
    for (const row of data.mutables_pending) upsert(map, mutableNode(row, map))
  }
  const body = asRecord(dispatch.body)
  const verb = dispatch.verb
  if (body !== undefined && typeof body.id === 'string') {
    if (verb === 'prd-add') upsert(map, prdNode(body, map))
    if (verb === 'prd-resolve') {
      const prior = map.get(body.id)
      upsert(map, {
        id: body.id,
        kind: prior?.kind ?? 'prd',
        title: prior?.title ?? body.id,
        subject: prior?.subject ?? null,
        status: 'resolved',
        obligationKind: prior?.obligationKind ?? null,
        prdId: prior?.prdId ?? null,
        routeFamily: prior?.routeFamily ?? null,
        dependsOn: prior?.dependsOn ?? [],
      })
    }
    if (verb === 'mutable-add') upsert(map, mutableNode(body, map))
    if (verb === 'mutable-resolve') {
      const prior = map.get(body.id)
      upsert(map, {
        id: body.id,
        kind: prior?.kind ?? 'mutable',
        title: prior?.title ?? body.id,
        subject: prior?.subject ?? null,
        status: 'witnessed',
        obligationKind: prior?.obligationKind ?? null,
        prdId: prior?.prdId ?? nodeId(body.prd_id) ?? null,
        routeFamily: null,
        dependsOn: prior?.dependsOn ?? [],
      })
    }
  }
  const walking = dispatch.status === 'running'
    ? { verb, nodeId: nodeId(body?.id) ?? previous?.walking?.nodeId ?? null }
    : null
  const nodes = capNodes([...map.values()], walking?.nodeId)
  return { nodes, edges: edgesFrom(nodes), walking }
}
