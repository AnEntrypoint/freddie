import { FlowRunner, extractFlowchart, parseFlowchart, findStartNode } from '../../src/agent/flow_runner.js'
import { resolveCallLLM } from '../../src/agent/llm_resolver.js'

let _log = null

export function setLogger(log) {
    _log = log
}

const WALKABLE_HELP =
    'need a fenced mermaid/d2 graph with a node whose id is BEGIN or START'

export const _tool = {
    name: 'run_flow',
    toolset: 'core',
    schema: {
        name: 'run_flow',
        description:
            'Preferred mechanism for multi-step tool graphs — use spontaneously; it reduces turns. Direct tool calls remain legal for single steps. ' +
            'Pass name to walk a SKILL.md, source for an inline mermaid/d2 graph (fenced, with a BEGIN or START node), or omit both to list walkable flow skills. ' +
            'Flow skills are SKILL.md files that contain a Mermaid or D2 flowchart. ' +
            'The flowchart is walked from BEGIN to END, feeding each node to the LLM with path history, prior results, and remaining blanks. ' +
            'Mark unknowns as {{name}} or {{name:hint}}; they are filled by the same LLM only when that node is visited ' +
            '(output <blank name="name">value</blank>). ' +
            'Decision nodes must output <choice>value</choice> to select the branch. ' +
            'Task and decision nodes may emit tool_calls; the runner dispatches them via the host and feeds results back into the same node before advancing.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Exact skill name (findSkill match; no fuzzy lookup).',
                },
                source: {
                    type: 'string',
                    description: 'Inline mermaid or d2 flowchart. Used instead of name. Must be a fenced mermaid/d2 block with a BEGIN or START node.',
                },
                args: {
                    type: 'string',
                    description: 'Optional arguments to pass to the flow skill.',
                },
                model: {
                    type: 'string',
                    description: 'Optional model override for the LLM calls within the flow.',
                },
                provider: {
                    type: 'string',
                    description: 'Optional provider override for the LLM calls within the flow.',
                },
            },
        },
    },
    handler: async (args, ctx) => {
        args = args || {}
        const hasSource = args.source != null
        const source = hasSource ? String(args.source).trim() : ''
        const name = args.name != null ? String(args.name).trim() : ''
        const common = {
            flowArgs: args.args || '',
            model: args.model || null,
            provider: args.provider || null,
            ctx,
            log: _log,
        }
        if (hasSource) return await runFlowSource({ source, ...common })
        if (name) return await runFlowSkill({ name, ...common })
        return { flows: await listWalkableFlows() }
    },
}


export function isWalkableFlowchart(markdown, { requireFence = true } = {}) {
    const extracted = extractFlowchart(markdown)
    if (!extracted) return false
    // Unfenced fallback is the whole SKILL.md — prose "START" / "->" must not count as a flow.
    if (requireFence && !extracted.fenced) return false
    const src = extracted.source || ''
    const looksMermaid = /^\s*(flowchart|graph)\s+(TB|TD|BT|RL|LR)\b/im.test(src)
    const looksD2 = extracted.format === 'd2' && /->/.test(src)
    if (!looksMermaid && !looksD2) return false
    try {
        const parsed = parseFlowchart(extracted.fenced ? markdown : src)
        const nodes = parsed.nodes || {}
        const names = Object.keys(nodes)
        if (!names.length) return false
        // Node id must be BEGIN or START. A label [BEGIN] on some other id is not enough.
        if (names.some((id) => /^(begin|start)$/i.test(id))) return true
        if (names.some((id) => nodes[id].type === 'start')) return true
        return false
    } catch {
        return false
    }
}

export async function listWalkableFlows() {
    const { listSkills } = await import('../../src/skills/index.js')
    return listSkills()
        .filter((s) => isWalkableFlowchart(s.body))
        .map((s) => ({ name: s.name, description: s.description || '' }))
}

function resolveWalkCallLLM(ctx, { provider, model } = {}) {
    if (typeof ctx?.callLLM === 'function') {
        const inner = ctx.callLLM
        return async (input = {}) => {
            const messages = Array.isArray(input.messages) ? input.messages : []
            const prompt = input.prompt != null
                ? String(input.prompt)
                : messages.map(m => (m && m.content) || '').join('\n')
            const result = await inner({ ...input, prompt, messages })
            if (result == null) return { content: '', tool_calls: [] }
            if (typeof result === 'string') return { content: result, tool_calls: [] }
            const content = result.content ?? result.text ?? ''
            return { ...result, content, tool_calls: result.tool_calls || [] }
        }
    }
    return resolveCallLLM({ provider: provider || undefined, model: model || undefined })
}

export async function runFlowSource({ source, flowArgs = '', model = null, provider = null, ctx = null, log = null } = {}) {
    const skillContent = String(source || '').trim()
    if (!skillContent) return { ok: false, error: 'source is empty', state: { moves: 0 } }
    // Gate on the ORIGINAL string before any auto-fence wrap. Wrapping would make unfenced BEGIN pass.
    if (!isWalkableFlowchart(skillContent)) {
        return { ok: false, error: `source is not a walkable flowchart (${WALKABLE_HELP})`, state: { moves: 0 } }
    }
    return runFlowSkill({
        name: '(inline)',
        flowArgs,
        model,
        provider,
        ctx,
        log,
        skillContent,
    })
}

export async function runFlowSkill({ name, flowArgs = '', model = null, provider = null, ctx = null, log = null, findSkillFn = null, skillContent = null } = {}) {
    if (log) log.info(`run_flow: ${name} args=${flowArgs}`)

    skillContent = skillContent || null
    let skill = null
    let findSkill = findSkillFn || null
    if (!skillContent) {
        try {
            if (!findSkill) findSkill = (await import('../../src/skills/index.js')).findSkill
            skill = findSkill(name)
        } catch (e) {
            if (log) log.warn(`run_flow: skill lookup failed: ${e.message}`)
            skill = null
        }

        if (!skill) {
            return { ok: false, error: `Flow skill not found: ${name}`, state: { moves: 0 } }
        }

        if (!skill.body || !skill.body.trim()) {
            return { ok: false, error: `Skill "${name}" has no body content`, state: { moves: 0 } }
        }
        skillContent = skill.body
        if (!isWalkableFlowchart(skillContent)) {
            return { ok: false, error: `Skill "${name}" is not a walkable flowchart (${WALKABLE_HELP})`, state: { moves: 0 } }
        }
    }

    const callLLM = resolveWalkCallLLM(ctx, { provider, model })

    let dispatchTool = typeof ctx?.dispatchTool === 'function' ? ctx.dispatchTool : null
    let tools = Array.isArray(ctx?.tools) ? ctx.tools : null
    // Stub walks pass only ctx.callLLM. Booting the host there hangs (no daemon) and
    // is unnecessary: the stub is the only LLM and tools are not dispatched.
    const stubOnly = typeof ctx?.callLLM === 'function' && typeof ctx?.dispatchTool !== 'function' && !ctx?.pi
    if (!dispatchTool && !stubOnly) {
        try {
            const { bootHost } = await import('../../src/host/index.js')
            const h = await bootHost()
            // Nested schemas inherit the caller allowlist (ctx.tools). Never
            // replace with bootHost's full surface — that would escalate
            // explore/plan (or any restricted caller) to write tools.
            if (!Array.isArray(tools)) tools = []
            tools = tools.filter(s => (s.name || s.function?.name) !== 'run_flow')
            if (!ctx?.askUser) tools = tools.filter(s => (s.name || s.function?.name) !== 'ask_user_question')
            const allowedNames = new Set(
                tools.map(s => s.name || s.function?.name).filter(Boolean),
            )
            if (h?.pi?.dispatchTool) {
                dispatchTool = (toolName, toolArgs, toolCtx) => {
                    if (toolName === 'run_flow') return JSON.stringify({ error: 'run_flow cannot nest inside a flow node' })
                    if (!allowedNames.has(toolName)) {
                        return JSON.stringify({ error: `tool ${toolName} is not in the caller allowlist` })
                    }
                    return h.pi.dispatchTool(toolName, toolArgs, toolCtx || ctx || {})
                }
            }
        } catch {
            dispatchTool = dispatchTool || null
            tools = tools || null
        }
    }

    const findSkillBound = typeof findSkill === 'function' ? findSkill : null
    const runCtx = { ...(ctx || {}), findSkill: findSkillBound || ctx?.findSkill }
    const runner = new FlowRunner({
        skillName: name,
        skillContent,
        callLLM,
        maxMoves: 1000,
        ctx: runCtx,
        dispatchTool,
        tools,
    })

    const result = await runner.run(flowArgs)

    if (log) {
        if (result.ok) {
            log.info(`run_flow: ${name} completed in ${result.state.moves} moves`)
        } else {
            log.warn(`run_flow: ${name} failed: ${result.error}`)
        }
    }

    const out = {
        ok: result.ok,
        state: {
            moves: result.state.moves,
            path: result.state.path,
            nodeCount: result.state.path.length,
        },
    }
    if (result.result) out.result = result.result
    if (result.error) out.error = result.error
    if (result.state.filled && Object.keys(result.state.filled).length) out.state.filled = result.state.filled
    return out
}

export async function flowCommandHandler(state, args) {
    const name = args[0]
    if (!name) {
        const flows = await listWalkableFlows()
        if (!flows.length) return 'no walkable flow skills (SKILL.md with a mermaid/d2 fence and a BEGIN/START node)'
        return flows.map(f => `${f.name}: ${f.description}`).join('\n')
    }

    const flowArgs = args.slice(1).join(' ')

    const result = await runFlowSkill({
        name,
        flowArgs,
        log: _log,
    })

    if (!result.ok) {
        return `flow error: ${result.error}`
    }

    const resSummary = result.result
        ? '\nResults:\n' + Object.entries(result.result)
            .map(([id, r]) => `  ${id}: ${(r.content || r.choice || '').slice(0, 120)}`)
            .join('\n')
        : ''

    return `Flow "${name}" completed in ${result.state.moves} moves, ${result.state.nodeCount} nodes visited.${resSummary}`
}
