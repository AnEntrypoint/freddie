// D2 flowchart parser + format detection.
//
// D2 syntax supported:
//   a: Node label
//   a.shape: diamond
//   a -> b: choice label

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

function parseD2(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'))
    const nodes = {}  // id -> { id, label, type }
    const edges = []  // { from, to, label }

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

export { detectFormat, parseD2 }
