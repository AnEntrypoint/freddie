// FlowRunner — walks Mermaid/D2 flowcharts parsed by flow_parser.js
// (BEGIN -> tasks -> decisions -> END), feeding each node's prompt to
// the LLM. Decision nodes expect `<choice>value</choice>` in the LLM output.
// Blanks marked `{{name}}` / `{{name:hint}}` stay unmarked until their node
// is visited; the same LLM fills them via `<blank name="name">value</blank>`.
// Junctions receive path history, prior results, remaining blanks, and choices.
// Browser-compatible: in-memory state, no node built-ins.
//
import { parseFlowchart } from './flow_parser.js'
import { findStartNode, getOutgoingEdges } from './flow_graph.js'
import { extractBlanks, substituteBlanks, parseBlankTags } from './flow_blanks.js'
import { recordFlowRun, ensureFlowDebug } from './flow_debug.js'

const DEFAULT_MAX_DEPTH = 4

function normalizeChoice(text) {
    let s = String(text || '').trim()
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim()
    }
    return s.toLowerCase()
}

function edgeLabels(outgoing) {
    return outgoing.map(e => e.label || 'default')
}

export class FlowRunner {
    constructor({
        skillName, skillContent, callLLM, maxMoves = 1000, ctx = null,
        dispatchTool = null, tools = null, maxToolRounds = 20,
        maxDepth = DEFAULT_MAX_DEPTH, depth = 0, filled = null,
    }) {
        this.skillName = skillName
        this.skillContent = skillContent
        this.callLLM = callLLM
        this.maxMoves = maxMoves
        this.ctx = ctx
        this.dispatchTool = dispatchTool
        this.tools = tools
        this.maxToolRounds = maxToolRounds
        this.maxDepth = maxDepth
        this.depth = depth
        this._nodes = {}
        this._edges = []
        this.state = { moves: 0, currentNode: null, messages: [], results: {}, path: [], filled: { ...(filled || {}) } }
        ensureFlowDebug()
    }

    _aborted() {
        const ctx = this.ctx
        if (!ctx) return false
        if (ctx.abort === true) return true
        if (typeof ctx.abort === 'function' && ctx.abort()) return true
        const sig = ctx.signal
        if (sig && (sig.aborted === true || (typeof sig.aborted === 'function' && sig.aborted()))) return true
        return false
    }

    _progress(phase, node) {
        const fn = this.ctx?.onProgress
        if (typeof fn !== 'function') return
        try {
            fn({
                flow: this.skillName,
                node: node?.id,
                type: node?.type,
                moves: this.state.moves,
                phase,
                path: this.state.path.slice(),
            })
        } catch { /* progress is best-effort */ }
    }

    _finish(out) {
        try {
            recordFlowRun({
                name: this.skillName,
                ok: !!out.ok,
                error: out.error || null,
                moves: this.state.moves,
                path: this.state.path,
                filledKeys: Object.keys(this.state.filled || {}),
            })
        } catch { /* debug ring is best-effort */ }
        return out
    }

    async run(args = '') {
        const { nodes, edges } = parseFlowchart(this.skillContent)
        this._nodes = nodes
        this._edges = edges
        if (!Object.keys(nodes).length) {
            return this._finish({ ok: false, error: 'No nodes found in flowchart', state: this.state })
        }

        const startId = findStartNode(nodes, edges)
        if (!startId) {
            return this._finish({ ok: false, error: 'No start node found', state: this.state })
        }

        this.state.currentNode = startId
        this.state.path.push(startId)

        while (this.state.moves < this.maxMoves) {
            if (this._aborted()) {
                return this._finish({ ok: false, error: 'aborted', result: this.state.results, state: this.state })
            }
            const node = nodes[this.state.currentNode]
            if (!node) {
                return this._finish({ ok: false, error: `Node not found: ${this.state.currentNode}`, state: this.state })
            }

            this._progress('enter', node)

            if (node.type === 'end') {
                this.state.messages.push({ role: 'system', content: `Flow reached END node: ${node.label}` })
                this._progress('exit', node)
                return this._finish({ ok: true, result: this.state.results, state: this.state })
            }

            if (node.type === 'start') {
                this.state.messages.push({ role: 'system', content: `Flow started at: ${node.label}` })
                const next = this._advanceToNext(node, edges, nodes)
                this._progress('exit', node)
                if (!next) return this._finish({ ok: false, error: `No outgoing edge from start node: ${node.id}`, state: this.state })
                continue
            }

            if (node.type === 'decision') {
                const decisionResult = await this._processDecision(node, edges, nodes, args)
                this._progress('exit', node)
                if (!decisionResult.ok) return this._finish(decisionResult)
                continue
            }

            if (node.type === 'subroutine') {
                const subResult = await this._processSubroutine(node, edges, nodes, args)
                this._progress('exit', node)
                if (!subResult.ok) return this._finish(subResult)
                continue
            }

            if (node.type === 'task') {
                const taskResult = await this._processTask(node, edges, nodes, args)
                this._progress('exit', node)
                if (!taskResult.ok) return this._finish(taskResult)
                continue
            }

            const taskResult = await this._processTask(node, edges, nodes, args)
            this._progress('exit', node)
            if (!taskResult.ok) return this._finish(taskResult)
        }

        return this._finish({ ok: false, error: `Flow exceeded max moves (${this.maxMoves})`, state: this.state })
    }

    _advanceToNext(node, edges, nodes) {
        const outgoing = getOutgoingEdges(node.id, edges)
        if (!outgoing.length) {
            return null
        }
        const nextId = outgoing[0].to
        this.state.currentNode = nextId
        this.state.path.push(nextId)
        this.state.moves++
        return nextId
    }

    _nodeOwnsBlank(node, name, edges) {
        if (extractBlanks(node.label).some(b => b.name === name)) return true
        const outgoing = getOutgoingEdges(node.id, edges || this._edges)
        return outgoing.some(e => extractBlanks(e.label).some(b => b.name === name))
    }

    _remainingBlanks() {
        const remaining = []
        const seen = new Set()
        for (const n of Object.values(this._nodes)) {
            for (const b of extractBlanks(n.label)) {
                if (this.state.filled[b.name] != null) continue
                if (seen.has(b.name)) continue
                seen.add(b.name)
                remaining.push({ name: b.name, hint: b.hint, from: n.id })
            }
        }
        for (const e of this._edges) {
            for (const b of extractBlanks(e.label)) {
                if (this.state.filled[b.name] != null) continue
                if (seen.has(b.name)) continue
                seen.add(b.name)
                remaining.push({ name: b.name, hint: b.hint, from: `${e.from}->${e.to}` })
            }
        }
        return remaining
    }

    _priorResultsSummary() {
        const ids = Object.keys(this.state.results)
        if (!ids.length) return ''
        return ids.map(id => {
            const r = this.state.results[id]
            const body = (r.choice || r.content || '').replace(/\s+/g, ' ').slice(0, 240)
            const toolBit = Array.isArray(r.tools) && r.tools.length
                ? ` tools=${r.tools.map(t => t.name || '?').join(',')}`
                : ''
            return `  ${id} (${r.type || 'task'}): ${body}${toolBit}`
        }).join('\n')
    }

    _toolName(tc) {
        return tc?.name || tc?.function?.name || ''
    }

    _toolArgs(tc) {
        let args = tc?.arguments ?? tc?.function?.arguments
        if (typeof args === 'string') {
            try { args = JSON.parse(args) } catch { args = {} }
        }
        if (!args || typeof args !== 'object' || Array.isArray(args)) return {}
        return args
    }

    _toolId(tc, i) {
        return tc?.id || ('flow_call_' + i)
    }

    async _runNodeLLM(prompt) {
        const messages = [{ role: 'user', content: prompt }]
        const tools = Array.isArray(this.tools) && this.tools.length && typeof this.dispatchTool === 'function' ? this.tools : null
        const traces = []
        const contents = []
        for (let round = 0; ; round++) {
            if (this._aborted()) {
                return {
                    ok: false,
                    error: 'aborted',
                    content: contents.join('\n'),
                    traces,
                    messages,
                }
            }
            if (round > this.maxToolRounds) {
                return {
                    ok: false,
                    error: `Flow "${this.skillName}" exceeded max tool rounds (${this.maxToolRounds}) at node ${this.state.currentNode}`,
                    content: contents.join('\n'),
                    traces,
                    messages,
                }
            }
            const llmResult = await this.callLLM({
                messages,
                ...(tools ? { tools } : {}),
            })
            const content = llmResult?.content || ''
            contents.push(content)
            const calls = Array.isArray(llmResult?.tool_calls) ? llmResult.tool_calls : []
            if (!calls.length) {
                return { ok: true, content: contents.join('\n'), traces, messages }
            }
            if (typeof this.dispatchTool !== 'function') {
                traces.push({ skipped: true, names: calls.map(c => this._toolName(c)).filter(Boolean) })
                return { ok: true, content: contents.join('\n'), traces, messages }
            }
            messages.push({ role: 'assistant', content, tool_calls: calls })
            for (let i = 0; i < calls.length; i++) {
                const tc = calls[i]
                const name = this._toolName(tc)
                const args = this._toolArgs(tc)
                const id = this._toolId(tc, i)
                let result
                try {
                    result = name
                        ? await this.dispatchTool(name, args, this.ctx)
                        : { error: 'missing tool name' }
                } catch (e) {
                    result = { error: String(e?.message || e), tool: name }
                }
                const rendered = typeof result === 'string' ? result : JSON.stringify(result)
                traces.push({ name, args, result: rendered, id })
                messages.push({ role: 'tool', tool_call_id: id, content: rendered })
            }
        }
    }

    _absorbBlanks(node, content, edges) {
        const newly = parseBlankTags(content)
        const accepted = {}
        for (const [name, value] of Object.entries(newly)) {
            if (!this._nodeOwnsBlank(node, name, edges)) continue
            this.state.filled[name] = value
            accepted[name] = value
        }
        return accepted
    }

    async _processTask(node, edges, nodes, args) {
        this.state.messages.push({ role: 'system', content: `Flow task: ${node.label}` })

        const ownBlanks = extractBlanks(node.label)
        let extra = ''
        if (ownBlanks.length) {
            extra = 'This node contains blanks. Fill each blank that appears in THIS node by outputting:\n<blank name="name">value</blank>\nDo not fill blanks that belong to later nodes. Leave those markers unmarked.'
        }

        const prompt = this._buildPrompt(node.label, args, extra)
        try {
            const llmRun = await this._runNodeLLM(prompt)
            if (!llmRun.ok) return { ok: false, error: llmRun.error, result: this.state.results, state: this.state }
            if (this._aborted()) return { ok: false, error: 'aborted', result: this.state.results, state: this.state }
            const content = llmRun.content
            const accepted = this._absorbBlanks(node, content, edges)
            this.state.results[node.id] = {
                label: substituteBlanks(node.label, this.state.filled),
                content,
                type: node.type,
                blanks: accepted,
                tools: llmRun.traces,
            }
            for (const m of llmRun.messages) {
                if (m.role === 'user') continue
                this.state.messages.push(m)
            }
            if (!llmRun.messages.some(m => m.role === 'assistant')) {
                this.state.messages.push({ role: 'assistant', content })
            }

            const next = this._advanceToNext(node, edges, nodes)
            if (!next) {
                return { ok: false, error: `Flow "${this.skillName}" stalled: no outgoing edge from node "${node.id}" and no END node reached`, result: this.state.results, state: this.state }
            }
            return { ok: true, state: this.state }
        } catch (e) {
            return { ok: false, error: `LLM error at node ${node.id}: ${e.message}`, state: this.state }
        }
    }

    async _processSubroutine(node, edges, nodes, args) {
        const skillName = String(node.label || '').trim()
        if (!skillName) {
            return { ok: false, error: `Subroutine node "${node.id}" has empty skill name`, state: this.state }
        }
        if (this.depth >= this.maxDepth) {
            return {
                ok: false,
                error: `Flow "${this.skillName}" subroutine depth exceeded (${this.maxDepth}) at node ${node.id} -> ${skillName}`,
                result: this.state.results,
                state: this.state,
            }
        }
        const findSkill = this.ctx?.findSkill
        if (typeof findSkill !== 'function') {
            return {
                ok: false,
                error: `Flow "${this.skillName}" subroutine "${skillName}" needs ctx.findSkill`,
                result: this.state.results,
                state: this.state,
            }
        }
        let skill
        try { skill = findSkill(skillName) } catch (e) {
            return { ok: false, error: `Subroutine lookup failed: ${e.message}`, state: this.state }
        }
        if (!skill || !skill.body) {
            return { ok: false, error: `Flow skill not found: ${skillName}`, state: this.state }
        }
        const child = new FlowRunner({
            skillName,
            skillContent: skill.body,
            callLLM: this.callLLM,
            maxMoves: this.maxMoves,
            ctx: this.ctx,
            dispatchTool: this.dispatchTool,
            tools: this.tools,
            maxToolRounds: this.maxToolRounds,
            maxDepth: this.maxDepth,
            depth: this.depth + 1,
            filled: this.state.filled,
        })
        const nested = await child.run(args)
        Object.assign(this.state.filled, nested.state?.filled || {})
        this.state.results[node.id] = {
            label: skillName,
            type: 'subroutine',
            nested: {
                ok: nested.ok,
                error: nested.error || null,
                path: nested.state?.path || [],
                moves: nested.state?.moves || 0,
            },
        }
        this.state.moves += nested.state?.moves || 0
        if (!nested.ok) {
            return { ok: false, error: nested.error, result: this.state.results, state: this.state }
        }
        const next = this._advanceToNext(node, edges, nodes)
        if (!next) {
            return { ok: false, error: `Flow "${this.skillName}" stalled: no outgoing edge from subroutine "${node.id}"`, result: this.state.results, state: this.state }
        }
        return { ok: true, state: this.state }
    }

    _matchEdge(outgoing, chosen) {
        const chosenLow = normalizeChoice(chosen)
        if (!chosenLow) return null
        return outgoing.find(e => {
            const raw = normalizeChoice(e.label || '')
            const filled = normalizeChoice(substituteBlanks(e.label || '', this.state.filled))
            return raw === chosenLow || filled === chosenLow
        }) || null
    }

    async _processDecision(node, edges, nodes, args) {
        this.state.messages.push({ role: 'system', content: `Flow decision: ${node.label}` })

        const outgoing = getOutgoingEdges(node.id, edges)
        const choices = outgoing.map(e => {
            const label = substituteBlanks(e.label || 'default', this.state.filled)
            const dest = substituteBlanks(nodes[e.to]?.label || e.to, this.state.filled)
            return `  - "${label}" -> ${dest}`
        }).join('\n')
        const ownBlanks = extractBlanks(node.label).concat(outgoing.flatMap(e => extractBlanks(e.label)))
        let extra = `You are at a decision point. Choose ONE of the following options by outputting ONLY:\n<choice>choice_value</choice>\n\nAvailable choices:\n${choices}`
        if (ownBlanks.length) {
            extra += '\n\nThis junction also contains blanks. Fill each blank that appears in THIS node or its outgoing edge labels by outputting:\n<blank name="name">value</blank>\nDo not fill blanks that belong to later nodes.'
        }

        const prompt = this._buildPrompt(node.label, args, extra)
        const labeled = outgoing.some(e => String(e.label || '').trim())

        try {
            let llmRun = await this._runNodeLLM(prompt)
            if (!llmRun.ok) return { ok: false, error: llmRun.error, result: this.state.results, state: this.state }
            if (this._aborted()) return { ok: false, error: 'aborted', result: this.state.results, state: this.state }
            let content = llmRun.content
            let choiceMatch = content.match(/<choice>\s*([\s\S]*?)\s*<\/choice>/i)

            if (!choiceMatch) {
                const repair = prompt + '\n\nPrevious reply had no usable <choice> tag. Output exactly one: <choice>value</choice> using one of the available labels.'
                llmRun = await this._runNodeLLM(repair)
                if (!llmRun.ok) return { ok: false, error: llmRun.error, result: this.state.results, state: this.state }
                if (this._aborted()) return { ok: false, error: 'aborted', result: this.state.results, state: this.state }
                content = (content ? content + '\n' : '') + llmRun.content
                choiceMatch = llmRun.content.match(/<choice>\s*([\s\S]*?)\s*<\/choice>/i)
            }

            const chosen = choiceMatch ? choiceMatch[1].trim() : ''
            const accepted = this._absorbBlanks(node, content, edges)

            this.state.results[node.id] = {
                label: substituteBlanks(node.label, this.state.filled),
                content,
                choice: chosen,
                type: 'decision',
                blanks: accepted,
                tools: llmRun.traces,
            }
            for (const m of llmRun.messages) {
                if (m.role === 'user') continue
                this.state.messages.push(m)
            }
            if (!llmRun.messages.some(m => m.role === 'assistant')) {
                this.state.messages.push({ role: 'assistant', content })
            }

            let matchedEdge = this._matchEdge(outgoing, chosen)

            if (!matchedEdge) {
                if (!outgoing.length) {
                    return { ok: false, error: `Flow "${this.skillName}" stalled: decision node "${node.id}" has no outgoing edges`, result: this.state.results, state: this.state }
                }
                if (labeled) {
                    const labels = edgeLabels(outgoing).map(l => `"${l}"`).join(', ')
                    return {
                        ok: false,
                        error: `Unmatched choice at node "${node.id}": "${chosen || '(empty)'}" (available: ${labels})`,
                        result: this.state.results,
                        state: this.state,
                    }
                }
                matchedEdge = outgoing[0]
            }

            this.state.currentNode = matchedEdge.to
            this.state.path.push(matchedEdge.to)
            this.state.moves++
            return { ok: true, state: this.state }
        } catch (e) {
            return { ok: false, error: `LLM error at decision node ${node.id}: ${e.message}`, state: this.state }
        }
    }

    _buildPrompt(nodeLabel, args, extra = '') {
        const filledLabel = substituteBlanks(nodeLabel, this.state.filled)
        const remaining = this._remainingBlanks()
        const pathLine = this.state.path.join(' -> ')
        const prior = this._priorResultsSummary()
        let prompt = filledLabel
        if (args) {
            prompt += `\n\nArguments: ${args}`
        }
        prompt += `\n\nPosition: node ${this.state.currentNode} of flow "${this.skillName}"`
        prompt += `\nPath: ${pathLine}`
        if (prior) {
            prompt += `\n\nPrior results:\n${prior}`
        }
        if (remaining.length) {
            prompt += `\n\nRemaining blanks (fill only those that appear in THIS node, using <blank name="name">value</blank>; leave others unmarked):\n`
            prompt += remaining.map(b => `  - {{${b.name}}}${b.hint ? ' — ' + b.hint : ''} (from ${b.from})`).join('\n')
        }
        if (Array.isArray(this.tools) && this.tools.length && typeof this.dispatchTool === 'function') {
            prompt += `\n\nYou may call tools to gather facts or act. After tool results arrive, finish THIS node (fill owned blanks; at a junction also output <choice>value</choice>).`
        }
        if (extra) {
            prompt += `\n\n${extra}`
        }
        return prompt
    }
}

export function createFlowRunner(opts) {
    return new FlowRunner(opts)
}
