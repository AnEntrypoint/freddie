/**
 * agent_swarm tool — launch multiple subagents from a single prompt template.
 * The placeholder is `{{item}}`. Each item fills the template and spawns one
 * subagent; all subagents run in parallel.
 *
 * Browser-compatible: all state in-memory, no filesystem calls.
 */

import { runSubagent } from '../core/delegate/lib/runner.js'

const MAX_ITEMS = 128
const MIN_ITEMS = 2

/**
 * Generate a unique swarm ID.
 * @returns {string}
 */
function generateSwarmId() {
    try {
        return `swarm_${crypto.randomUUID()}`
    } catch {
        return `swarm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    }
}

/**
 * Fill the {{item}} placeholder in the prompt template.
 * @param {string} template
 * @param {string} item
 * @returns {string}
 */
function fillTemplate(template, item) {
    return template.replace(/\{\{item\}\}/g, item)
}

export const _tool = {
    name: 'agent_swarm',
    toolset: 'core',
    schema: {
        name: 'agent_swarm',
        description: 'Launch multiple subagents from one prompt template. Use {{item}} as placeholder.',
        parameters: {
            type: 'object',
            properties: {
                description: { type: 'string', description: 'Short description for the whole swarm.' },
                subagent_type: { type: 'string', description: 'Subagent type: coder (default), explore, or plan.' },
                prompt_template: { type: 'string', description: 'Prompt template with {{item}} placeholder.' },
                items: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Values to fill {{item}}. Each launches one subagent.',
                    maxItems: MAX_ITEMS,
                },
                resume_agent_ids: {
                    type: 'object',
                    description: 'Map of agent_id to resume prompt.',
                },
            },
            required: ['description'],
        },
    },
    handler: async (args, ctx = {}) => {
        const {
            description,
            subagent_type = 'coder',
            prompt_template,
            items,
            resume_agent_ids,
        } = args

        const swarmId = generateSwarmId()

        // --- Validation ---

        // If items is provided, prompt_template is required and must contain {{item}}.
        if (items && items.length > 0) {
            if (!prompt_template) {
                return { error: 'prompt_template is required when items are provided' }
            }
            if (!prompt_template.includes('{{item}}')) {
                return { error: 'prompt_template must contain {{item}} placeholder' }
            }
        }

        // At least 2 items unless resume_agent_ids is provided.
        const resumeCount = resume_agent_ids ? Object.keys(resume_agent_ids).length : 0
        const itemCount = items ? items.length : 0
        if (itemCount > 0 && itemCount < MIN_ITEMS && resumeCount === 0) {
            return { error: `at least ${MIN_ITEMS} items required unless resume_agent_ids is provided` }
        }

        // Max 128 items.
        if (itemCount > MAX_ITEMS) {
            return { error: `maximum ${MAX_ITEMS} items allowed` }
        }

        // Filled-in prompts must be distinct.
        if (items && items.length > 0) {
            const filled = items.map(item => fillTemplate(prompt_template, item))
            const unique = new Set(filled)
            if (unique.size !== filled.length) {
                return { error: 'filled-in prompts must be distinct (two items expanded to the same prompt)' }
            }
        }

        // --- Spawn subagents ---

        const promises = []

        // Spawn one subagent per item.
        if (items && items.length > 0) {
            for (const item of items) {
                const task = fillTemplate(prompt_template, item)
                promises.push(
                    runSubagent({
                        task,
                        subagent_type,
                        ctx,
                        depth: (ctx.depth || 0) + 1,
                    }).then(out => ({
                        agent_id: out.agent_id,
                        ok: !out.error,
                        result: out.result || null,
                        error: out.error || null,
                    }))
                )
            }
        }

        // Resume existing subagents.
        if (resume_agent_ids) {
            for (const [agentId, resumePrompt] of Object.entries(resume_agent_ids)) {
                const task = typeof resumePrompt === 'string' ? resumePrompt : 'continue'
                promises.push(
                    runSubagent({
                        task,
                        subagent_type,
                        ctx,
                        depth: (ctx.depth || 0) + 1,
                    }).then(out => ({
                        agent_id: agentId,
                        ok: !out.error,
                        result: out.result || null,
                        error: out.error || null,
                    }))
                )
            }
        }

        const results = await Promise.all(promises)

        const subagentCount = results.length

        return {
            swarm_id: swarmId,
            description,
            subagent_count: subagentCount,
            results,
        }
    },
}