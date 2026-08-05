// FlowRunner — parses Mermaid/D2 flowcharts from skill bodies and walks
// nodes (BEGIN -> tasks -> decisions -> END), feeding each node's prompt to
// the LLM. Decision nodes expect `<choice>value</choice>` in the LLM output.
// Browser-compatible: in-memory state, no node built-ins.
//
// Mermaid syntax supported:
//   flowchart TD / graph TD / flowchart LR / graph LR
//   A[Task label]      — rectangle (task)
//   A{Decision?}       — diamond (decision)
//   A((Circle))        — circle (start)
//   A([Stadium])       — stadium (end)
//   A[[Subroutine]]    — subroutine (nested skill)
//   A --> B            — plain edge
//   A -->|choice| B    — labeled edge (decision branch)
//   A -- text --> B    — alternative labeled edge
//
// D2 syntax supported:
//   a: Node label
//   a.shape: diamond
//   a -> b: choice label
//
// Max 1000 moves. State is in-memory — no persistence.

// Parser: detect format, extract nodes and edges

const RE_MERMAID = /^\s*(flowchart|graph)\s+(TB|TD|BT|RL|LR)\s*$/im
const RE_D2_LINE = /^\s*\w[\w.]*\s*:\s*/m

function detectFormat(content) {
    if (RE_MERMAID.test(content)) return 'mermaid'
    if (RE_D2_LINE.test(content)) return 'd2'
    // Heuristic: Mermaid has `-->` or `---` edges; D2 has `->`
    if (/-->/m.test(content) || /---/m.test(content)) return 'mermaid'
    if (/->/m.test(content)) return 'd2'
    return 'mermaid' // default
}

// Mermaid parser

// Ordered bracket pairs for node shape detection. Tested longest-first so
// [[ (subroutine) matches before [ (rectangle).
const BRACKET_PAIRS = [
    { open: '[[', close: ']]', type: 'subroutine' },
    { open: '((', close: '))', type: 'start' },
    { open: '([', close: '])', type: 'end' },
    { open: '[',  close: ']',  type: 'task' },
    { open: '{',  close: '}',  type: 'decision' },
    { open: '(',  close: ')',  type: 'task' },
    { open: '>',  close: ']',  type: 'task' },
    { open: '/',  close: '/',  type: 'task' },
    { open: '\\', close: '\\', type: 'task' },
    { open: '/',  close: '\\', type: 'task' },
    { open: '\\', close: '/',  type: 'task' },
]

function parseMermaidNode(line) {
    // Match: ID<open>label<close>  where <open>/<close> are from BRACKET_PAIRS.
    // The ID is alphanumeric; the open bracket follows immediately.
    const idMatch = line.match(/^(\w+)\s*(.+)$/)
    if (!idMatch) return null
    const id = idMatch[1]
    const rest = idMatch[2]
    for (const bp of BRACKET_PAIRS) {
        if (rest.startsWith(bp.open) && rest.endsWith(bp.close)) {
            const label = rest.slice(bp.open.length, rest.length - bp.close.length).trim() || id
            return { id, label, type: bp.type }
        }
    }
    return null
}

function parseMermaid(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'))
    const nodes = {}  // id -> { id, label, type }
    const edges = []  // { from, to, label }
    const chainEdges = [] // deferred chain edges

    for (const line of lines) {
        // Skip flowchart/graph declarations and subgraph markers
        if (/^(flowchart|graph)\s+(TB|TD|BT|RL|LR)\s*$/i.test(line)) continue
        if (/^(subgraph|end)\b/i.test(line)) continue

        // First, extract any inline node definitions from the line
        // (nodes may appear inline on edge lines like: A[Label] --> B{Decide})
        const nodeRegex = /(\w+)(\[\[[^\]]*\]\]|\(\([^)]*\)\)|\(\[[^\]]*\]\)|\[[^\]]*\]|\{[^}]*\}|\([^)]*\)|>[^\]]*\]|\/[^/]*\/|\/[^\\]*\\|\\[^/]*\/)/g
        let nodeMatch
        while ((nodeMatch = nodeRegex.exec(line)) !== null) {
            const id = nodeMatch[1]
            const full = nodeMatch[2]
            const parsed = parseMermaidNode(id + full)
            if (parsed && !nodes[parsed.id]) {
                nodes[parsed.id] = { id: parsed.id, label: parsed.label, type: parsed.type }
            }
        }

        // Try to match a standalone node definition: ID[Shape] or ID{Shape} etc.
        const standaloneMatch = parseMermaidNode(line)
        if (standaloneMatch && !nodes[standaloneMatch.id]) {
            nodes[standaloneMatch.id] = { id: standaloneMatch.id, label: standaloneMatch.label, type: standaloneMatch.type }
            continue
        }

        // Try to match an edge
        const edgeMatch = parseMermaidEdge(line)
        if (edgeMatch) {
            const { from, to, label: edgeLabel } = edgeMatch
            // Ensure nodes exist (may be defined inline in edge)
            if (!nodes[from]) nodes[from] = { id: from, label: from, type: 'task' }
            if (!nodes[to]) nodes[to] = { id: to, label: to, type: 'task' }
            edges.push({ from, to, label: edgeLabel || '' })
            if (edgeMatch.chain) {
                chainEdges.push({ from: to, to: edgeMatch.chain, label: '' })
            }
            continue
        }

        // Try to match a simple node reference A --> B where A and B are just IDs
        const simpleRef = line.match(/^(\w+)\s*$/)
        if (simpleRef && !nodes[simpleRef[1]]) {
            nodes[simpleRef[1]] = { id: simpleRef[1], label: simpleRef[1], type: 'task' }
        }
    }

    // Add deferred chain edges
    for (const ce of chainEdges) {
        if (!nodes[ce.from]) nodes[ce.from] = { id: ce.from, label: ce.from, type: 'task' }
        if (!nodes[ce.to]) nodes[ce.to] = { id: ce.to, label: ce.to, type: 'task' }
        edges.push(ce)
    }

    return { nodes, edges, format: 'mermaid' }
}

function parseMermaidEdge(line) {
    // First, strip inline node shapes so we can reliably extract node IDs.
    // E.g. "A[Label] --> B{Decide}" becomes "A --> B"
    const stripped = line.replace(/(\w+)(\[\[[^\]]*\]\]|\(\([^)]*\)\)|\(\[[^\]]*\]\)|\[[^\]]*\]|\{[^}]*\}|\([^)]*\)|>[^\]]*\]|\/[^/]*\/|\/[^\\]*\\|\\[^/]*\/)/g, '$1')

    // Pattern: A --> B  or  A -->|label| B  or  A -- label --> B

    // Labeled: A -->|choice| B
    let m = stripped.match(/^(\w+)\s*-->\|([^|]+)\|\s*(\w+)\s*$/)
    if (m) return { from: m[1], to: m[3], label: m[2].trim() }

    // Alternative labeled: A -- text --> B
    m = stripped.match(/^(\w+)\s*--\s+(.+?)\s+-->\s*(\w+)\s*$/)
    if (m) return { from: m[1], to: m[3], label: m[2].trim() }

    // Plain: A --> B
    m = stripped.match(/^(\w+)\s*-->\s*(\w+)\s*$/)
    if (m) return { from: m[1], to: m[2], label: '' }

    // Dotted: A -.-> B
    m = stripped.match(/^(\w+)\s*-\.\.?->\s*(\w+)\s*$/)
    if (m) return { from: m[1], to: m[2], label: '' }

    // Thick: A ==> B
    m = stripped.match(/^(\w+)\s*==>\s*(\w+)\s*$/)
    if (m) return { from: m[1], to: m[2], label: '' }

    // Chain: A --> B --> C
    m = stripped.match(/^(\w+)\s*-->\s*(\w+)\s*-->\s*(\w+)\s*$/)
    if (m) return { from: m[1], to: m[2], label: '', chain: m[3] }

    return null
}

// D2 parser

function parseD2(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'))
    const nodes = {}  // id -> { id, label, type }
    const edges = []  // { from, to, label }
    const unresolved = [] // edges that reference nodes not yet defined

    for (const line of lines) {
        // Skip comments, direction, style lines
        if (/^(direction|style|class|vars|layers|scenarios|themes)\b/i.test(line)) continue

        // Shape attribute on its own line: id.shape: diamond — must check BEFORE
        // the generic node-definition pattern, since `.shape:` also matches `id: value`.
        const shapeAttr = line.match(/^(\w[\w.]*)\.shape\s*:\s*(.+)$/)
        if (shapeAttr) {
            const id = shapeAttr[1]
            if (!nodes[id]) nodes[id] = { id, label: id, type: 'task' }
            const shape = shapeAttr[2].trim()
            if (shape === 'diamond') nodes[id].type = 'decision'
            else if (shape === 'circle') nodes[id].type = 'start'
            else if (shape === 'stadium') nodes[id].type = 'end'
            continue
        }

        // Node definition: id: Label
        const nodeDef = line.match(/^(\w[\w.]*)\s*:\s*(.+)$/)
        if (nodeDef) {
            const id = nodeDef[1]
            const rest = nodeDef[2].trim()
            if (nodes[id]) {
                // Shape attribute for existing node
                if (rest === 'diamond' || rest === 'shape: diamond') {
                    nodes[id].type = 'decision'
                } else if (rest === 'circle' || rest === 'shape: circle') {
                    nodes[id].type = 'start'
                } else if (rest === 'stadium' || rest === 'shape: stadium') {
                    nodes[id].type = 'end'
                }
            } else {
                nodes[id] = { id, label: rest, type: 'task' }
            }
            continue
        }

        // Edge: a -> b  or  a -> b: label
        const edgeMatch = line.match(/^(\w[\w.]*)\s*->\s*(\w[\w.]*)\s*(?::\s*(.+))?$/)
        if (edgeMatch) {
            const from = edgeMatch[1]
            const to = edgeMatch[2]
            const label = (edgeMatch[3] || '').trim()
            if (!nodes[from]) nodes[from] = { id: from, label: from, type: 'task' }
            if (!nodes[to]) nodes[to] = { id: to, label: to, type: 'task' }
            edges.push({ from, to, label })
            continue
        }
    }

    return { nodes, edges, format: 'd2' }
}

// Unified parse

function parseFlowchart(content) {
    const format = detectFormat(content)
    if (format === 'd2') return parseD2(content)
    return parseMermaid(content)
}

// Graph walker

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

// FlowRunner

export class FlowRunner {
    /**
     * @param {object} opts
     * @param {string} opts.skillName   — name of the flow skill
     * @param {string} opts.skillContent — raw body of the SKILL.md (the flowchart)
     * @param {function} opts.callLLM    — ({ messages, model, provider }) => { content, tool_calls?, raw }
     * @param {number} [opts.maxMoves=1000]
     * @param {object} [opts.ctx]        — optional tool context for progress callbacks
     */
    constructor({ skillName, skillContent, callLLM, maxMoves = 1000, ctx = null }) {
        this.skillName = skillName
        this.skillContent = skillContent
        this.callLLM = callLLM
        this.maxMoves = maxMoves
        this.ctx = ctx
        this.state = { moves: 0, currentNode: null, messages: [], results: {}, path: [] }
    }

    async run(args = '') {
        const { nodes, edges } = parseFlowchart(this.skillContent)
        if (!Object.keys(nodes).length) {
            return { ok: false, error: 'No nodes found in flowchart', state: this.state }
        }

        const startId = findStartNode(nodes, edges)
        if (!startId) {
            return { ok: false, error: 'No start node found', state: this.state }
        }

        this.state.currentNode = startId
        this.state.path.push(startId)

        // Walk the graph
        while (this.state.moves < this.maxMoves) {
            const node = nodes[this.state.currentNode]
            if (!node) {
                return { ok: false, error: `Node not found: ${this.state.currentNode}`, state: this.state }
            }

            if (node.type === 'end') {
                this.state.messages.push({ role: 'system', content: `Flow reached END node: ${node.label}` })
                return { ok: true, result: this.state.results, state: this.state }
            }

            if (node.type === 'start') {
                // BEGIN node: just move to the next
                this.state.messages.push({ role: 'system', content: `Flow started at: ${node.label}` })
                const next = this._advanceToNext(node, edges, nodes)
                if (!next) return { ok: false, error: `No outgoing edge from start node: ${node.id}`, state: this.state }
                continue
            }

            if (node.type === 'decision') {
                const decisionResult = await this._processDecision(node, edges, nodes, args)
                if (!decisionResult.ok) return decisionResult
                // _processDecision handles the move
                continue
            }

            if (node.type === 'task' || node.type === 'subroutine') {
                const taskResult = await this._processTask(node, edges, nodes, args)
                if (!taskResult.ok) return taskResult
                // _processTask handles the move
                continue
            }

            // Unknown node type: treat as task
            const taskResult = await this._processTask(node, edges, nodes, args)
            if (!taskResult.ok) return taskResult
        }

        return { ok: false, error: `Flow exceeded max moves (${this.maxMoves})`, state: this.state }
    }

    _advanceToNext(node, edges, nodes) {
        const outgoing = getOutgoingEdges(node.id, edges)
        if (!outgoing.length) {
            // No outgoing edges — check if we should end
            return null
        }
        // Follow the first edge
        const nextId = outgoing[0].to
        this.state.currentNode = nextId
        this.state.path.push(nextId)
        this.state.moves++
        return nextId
    }

    async _processTask(node, edges, nodes, args) {
        this.state.messages.push({ role: 'system', content: `Flow task: ${node.label}` })

        const prompt = this._buildPrompt(node.label, args)
        try {
            const llmResult = await this.callLLM({
                messages: [{ role: 'user', content: prompt }],
            })
            const content = llmResult?.content || ''
            this.state.results[node.id] = { label: node.label, content, type: node.type }
            this.state.messages.push({ role: 'assistant', content })

            const next = this._advanceToNext(node, edges, nodes)
            if (!next) {
                return { ok: true, result: this.state.results, state: this.state }
            }
            return { ok: true, state: this.state }
        } catch (e) {
            return { ok: false, error: `LLM error at node ${node.id}: ${e.message}`, state: this.state }
        }
    }

    async _processDecision(node, edges, nodes, args) {
        this.state.messages.push({ role: 'system', content: `Flow decision: ${node.label}` })

        const outgoing = getOutgoingEdges(node.id, edges)
        const choices = outgoing.map(e => `  - "${e.label || 'default'}" -> ${nodes[e.to]?.label || e.to}`).join('\n')
        const prompt = this._buildPrompt(
            `${node.label}\n\nYou are at a decision point. Choose ONE of the following options by outputting ONLY:\n<choice>choice_value</choice>\n\nAvailable choices:\n${choices}`,
            args
        )

        try {
            const llmResult = await this.callLLM({
                messages: [{ role: 'user', content: prompt }],
            })
            const content = llmResult?.content || ''

            // Parse <choice>value</choice>
            const choiceMatch = content.match(/<choice>\s*(.+?)\s*<\/choice>/s)
            const chosen = choiceMatch ? choiceMatch[1].trim() : ''

            this.state.results[node.id] = { label: node.label, content, choice: chosen, type: 'decision' }
            this.state.messages.push({ role: 'assistant', content })

            // Find the matching edge
            let matchedEdge = null
            if (chosen) {
                matchedEdge = outgoing.find(e => e.label.toLowerCase() === chosen.toLowerCase())
                if (!matchedEdge) {
                    // Try partial match
                    matchedEdge = outgoing.find(e =>
                        e.label.toLowerCase().includes(chosen.toLowerCase()) ||
                        chosen.toLowerCase().includes(e.label.toLowerCase())
                    )
                }
            }

            if (!matchedEdge) {
                // Default: take the first edge
                matchedEdge = outgoing[0]
                this.state.messages.push({
                    role: 'system',
                    content: `No matching choice for "${chosen}" — defaulting to first edge: "${matchedEdge.label || 'default'}"`
                })
            }

            this.state.currentNode = matchedEdge.to
            this.state.path.push(matchedEdge.to)
            this.state.moves++
            return { ok: true, state: this.state }
        } catch (e) {
            return { ok: false, error: `LLM error at decision node ${node.id}: ${e.message}`, state: this.state }
        }
    }

    _buildPrompt(nodeLabel, args) {
        let prompt = nodeLabel
        if (args) {
            prompt += `\n\nArguments: ${args}`
        }
        return prompt
    }
}

// Convenience factory

/**
 * Create a FlowRunner from raw skill content, using the project's LLM resolver.
 * Browser-compatible: the callLLM function is passed in, not imported here.
 */
export function createFlowRunner({ skillName, skillContent, callLLM, maxMoves, ctx }) {
    return new FlowRunner({ skillName, skillContent, callLLM, maxMoves, ctx })
}

// Exported helpers

export { parseFlowchart, findStartNode, detectFormat }