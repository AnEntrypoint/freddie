// Graph walker helpers — locate the start node and enumerate outgoing edges
// over the {nodes, edges} shape produced by flow_parser.js.

function findStartNode(nodes, edges) {
    // Prefer a node named 'BEGIN', 'START', 'start' (case-insensitive)
    const names = Object.keys(nodes)
    const byLabel = (label) => names.find(id => nodes[id].label.toLowerCase() === label.toLowerCase())
    const begin = byLabel('begin') || byLabel('start')
    if (begin) return begin

    // Prefer a node of type 'start'
    const startNode = names.find(id => nodes[id].type === 'start')
    if (startNode) return startNode

    // Fallback: node with no incoming edges
    const hasIncoming = new Set(edges.map(e => e.to))
    const root = names.find(id => !hasIncoming.has(id))
    if (root) return root

    // Last resort: first node
    return names[0] || null
}

function getOutgoingEdges(nodeId, edges) {
    return edges.filter(e => e.from === nodeId)
}

export { findStartNode, getOutgoingEdges }
