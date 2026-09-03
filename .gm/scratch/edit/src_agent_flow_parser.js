// Mermaid flowchart parser + unified dispatch. Detects Mermaid/D2 format and
// extracts nodes/edges from skill bodies. Browser-compatible: no node built-ins.
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
// D2 parsing (syntax + format detection) lives in flow_parser_d2.js.

import { detectFormat, parseD2 } from './flow_parser_d2.js'
import { protectBlanks, restoreBlanks } from './flow_blanks.js'

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

const NON_GRAPH_MERMAID = /^\s*(sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|pie|gantt|journey|gitGraph|mindmap|timeline|quadrantChart|sankey(?:-beta)?|xychart(?:-beta)?|block-beta|kanban|packet-beta|architecture-beta|C4Context|requirementDiagram|radar-beta)\b/im
const FENCE_RE = /```([a-zA-Z0-9_+-]*)[^\n]*\n([\s\S]*?)```/g

function isGraphFence(lang, body) {
    const l = String(lang || '').toLowerCase()
    const text = String(body || '')
    if (l === 'd2') return true
    if (l === 'mermaid' || l === 'mmd') {
        if (NON_GRAPH_MERMAID.test(text)) return false
        return /^\s*(flowchart|graph)\s+(TB|TD|BT|RL|LR)\b/im.test(text) || /-->/.test(text)
    }
    if (!l) {
        if (/^\s*(flowchart|graph)\s+(TB|TD|BT|RL|LR)\b/im.test(text)) return true
        if (detectFormat(text) === 'd2' && /->/.test(text)) return true
    }
    return false
}

function extractFlowchart(content) {
    const text = String(content || '')
    const re = new RegExp(FENCE_RE.source, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
        const lang = m[1] || ''
        const body = m[2]
        if (isGraphFence(lang, body)) {
            return { source: body, format: detectFormat(body), fenced: true }
        }
    }
    return { source: text, format: detectFormat(text), fenced: false }
}

// Unified parse

function parseFlowchart(content) {
    const { source } = extractFlowchart(content)
    const { out, saved } = protectBlanks(source)
    const format = detectFormat(out)
    const parsed = format === 'd2' ? parseD2(out) : parseMermaid(out)
    for (const id of Object.keys(parsed.nodes)) {
        parsed.nodes[id].label = restoreBlanks(parsed.nodes[id].label, saved)
    }
    for (const e of parsed.edges) {
        e.label = restoreBlanks(e.label, saved)
    }
    return parsed
}

export { parseFlowchart, extractFlowchart, detectFormat, parseMermaid, parseD2 }
