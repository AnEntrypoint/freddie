import { FlowRunner } from '../../src/agent/flow_runner.js'
import { resolveCallLLM } from '../../src/agent/llm_resolver.js'

let _log = null

export function setLogger(log) {
    _log = log
}

export const _tool = {
    name: 'run_flow',
    toolset: 'core',
    schema: {
        name: 'run_flow',
        description:
            'Preferred mechanism for multi-step tool graphs. Direct tool calls remain legal for single steps. ' +
            'Run a flow skill by name. Flow skills are SKILL.md files that contain a Mermaid or D2 flowchart. ' +
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
            required: ['name'],
        },
    },
    handler: async (args, ctx) => {
        return await runFlowSkill({
            name: args.name,
            flowArgs: args.args || '',
            model: args.model || null,
            provider: args.provider || null,
            ctx,
            log: _log,
        })
    },
}

export async function runFlowSkill({ name, flowArgs = '', model = null, provider = null, ctx = null, log = null, findSkillFn = null } = {}) {
    if (log) log.info(`run_flow: ${name} args=${flowArgs}`)

    let skill
    let findSkill = findSkillFn || null
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

    const callLLM = resolveCallLLM({ provider: provider || undefined, model: model || undefined })

    let dispatchTool = null
    let tools = null
    try {
        const { bootHost } = await import('../../src/host/index.js')
        const { getEnabledToolSchemas, getAvailableToolsets } = await import('../../src/toolsets.js')
        const h = await bootHost()
        if (h?.pi?.dispatchTool) {
            dispatchTool = (toolName, toolArgs, toolCtx) => {
                if (toolName === 'run_flow') return JSON.stringify({ error: 'run_flow cannot nest inside a flow node' })
                return h.pi.dispatchTool(toolName, toolArgs, toolCtx || ctx || {})
            }
        }
        const sets = Array.isArray(ctx?.enabledToolsets)
            ? ctx.enabledToolsets
            : await getAvailableToolsets()
        const disabled = [
            ...(Array.isArray(ctx?.disabledToolsets) ? ctx.disabledToolsets : []),
            'run_flow',
        ]
        const schemas = await getEnabledToolSchemas(sets, disabled)
        tools = (schemas || []).filter(s => (s.name || s.function?.name) !== 'run_flow')
        if (!ctx?.askUser) tools = tools.filter(s => (s.name || s.function?.name) !== 'ask_user_question')
    } catch {
        dispatchTool = null
        tools = null
    }

    const findSkillBound = typeof findSkill === 'function' ? findSkill : null
    const runCtx = { ...(ctx || {}), findSkill: findSkillBound || ctx?.findSkill }
    const runner = new FlowRunner({
        skillName: name,
        skillContent: skill.body,
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
    if (!name) return 'usage: /flow <name> [args...] — run a flow skill'

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
