// run_flow tool — execute a flow skill (Mermaid/D2 flowchart in a SKILL.md).
// Finds the named skill, parses its flowchart body, and walks the nodes.

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
            'Run a flow skill by name. Flow skills are SKILL.md files that contain a Mermaid or D2 flowchart. ' +
            'The flowchart is walked from BEGIN to END, feeding each node to the LLM. ' +
            'Decision nodes must output <choice>value</choice> to select the branch.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the flow skill to run (matches the skill name).',
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

/**
 * Run a flow skill by name.
 * @param {object} opts
 * @param {string} opts.name          — skill name
 * @param {string} [opts.flowArgs]    — arguments for the flow
 * @param {string} [opts.model]       — model override
 * @param {string} [opts.provider]    — provider override
 * @param {object} [opts.ctx]         — tool context
 * @param {object} [opts.log]         — logger
 * @param {function} [opts.findSkillFn] — custom skill lookup (for testing)
 * @returns {object} { ok, result?, error?, state }
 */
export async function runFlowSkill({ name, flowArgs = '', model = null, provider = null, ctx = null, log = null, findSkillFn = null } = {}) {
    if (log) log.info(`run_flow: ${name} args=${flowArgs}`)

    // Resolve the skill — use the provided finder or the default from skills/index.js
    let skill
    try {
        const findSkill = findSkillFn || (await import('../../src/skills/index.js')).findSkill
        skill = findSkill(name)
    } catch (e) {
        if (log) log.warn(`run_flow: skill lookup failed: ${e.message}`)
        // Fallback for browser: try to find via host
        skill = null
    }

    if (!skill) {
        return { ok: false, error: `Flow skill not found: ${name}`, state: { moves: 0 } }
    }

    if (!skill.body || !skill.body.trim()) {
        return { ok: false, error: `Skill "${name}" has no body content`, state: { moves: 0 } }
    }

    // Build the LLM caller
    const callLLM = resolveCallLLM({ provider: provider || undefined, model: model || undefined })

    const runner = new FlowRunner({
        skillName: name,
        skillContent: skill.body,
        callLLM,
        maxMoves: 1000,
        ctx,
    })

    const result = await runner.run(flowArgs)

    if (log) {
        if (result.ok) {
            log.info(`run_flow: ${name} completed in ${result.state.moves} moves`)
        } else {
            log.warn(`run_flow: ${name} failed: ${result.error}`)
        }
    }

    return {
        ok: result.ok,
        result: result.result || null,
        error: result.error || null,
        state: {
            moves: result.state.moves,
            path: result.state.path,
            nodeCount: result.state.path.length,
        },
    }
}

// CLI command: /flow:<name>

/**
 * Handle the /flow:<name> slash command from the REPL.
 * @param {object} state  — REPL state ({ messages, session, ... })
 * @param {string[]} args — command arguments ([name, ...flowArgs])
 * @returns {string}      — message to display
 */
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