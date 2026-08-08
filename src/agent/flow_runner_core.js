// FlowRunner — walks Mermaid/D2 flowcharts parsed by flow_parser.js
// (BEGIN -> tasks -> decisions -> END), feeding each node's prompt to
// the LLM. Decision nodes expect `<choice>value</choice>` in the LLM output.
// Browser-compatible: in-memory state, no node built-ins.
//
// Max 1000 moves. State is in-memory — no persistence.

import { parseFlowchart } from './flow_parser.js'
import { findStartNode, getOutgoingEdges } from './flow_graph.js'

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
