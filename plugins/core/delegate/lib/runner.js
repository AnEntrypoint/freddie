/**
 * Shared subagent runner for delegate and agent_swarm tools.
 * Extracted from plugins/core/delegate/handler.js to allow both tools
 * to spawn subagents without duplicating the turn-loop logic.
 *
 * Browser-compatible: all state in-memory, no filesystem calls for git context.
 */

import { runTurn } from '../../../../src/agent/machine.js'
import { getEnabledToolNames } from '../../../../src/toolsets.js'
import { LaborMarket } from '../../../../src/agent/agent_specs.js'
import { persistSubagent, loadSubagent } from '../store.js'
import { telemetry } from '../../../../src/observability/telemetry.js'
import { generateAgentId, normalizeTimeout, collectGitContext, buildResumePrompt, DEFAULT_TIMEOUT_S } from './subagent-helpers.js'
import { runSubagentInBackground } from './subagent-background.js'
import { runSubagentInForeground } from './subagent-foreground.js'

const MAX_DEPTH = 3

/**
 * Run a subagent turn.
 *
 * @param {object} opts
 * @param {string} opts.prompt — the task prompt for the subagent
 * @param {string} [opts.description] — short description (3-5 words)
 * @param {string} [opts.subagent_type='coder'] — coder, explore, or plan
 * @param {string} [opts.model] — model override; null = inherit from parent
 * @param {string} [opts.resume] — agent_id to resume instead of creating new
 * @param {number} [opts.max_iterations=30]
 * @param {boolean} [opts.run_in_background=false] — if true, returns immediately
 * @param {number} [opts.timeout_s=600] — timeout in seconds (30-3600)
 * @param {object} [opts.ctx={}] — parent tool context (callLLM, depth, etc.)
 * @param {number} [opts.depth] — explicit depth override (for swarm use)
 * @returns {Promise<{result?:string, error?:string, iterations?:number, depth:number, agent_id:string, subagent_type:string, background?:boolean, task_id?:string, timed_out?:boolean}>}
 */
export async function runSubagent({
    prompt,
    task: taskAlias,          // backward compat: accept 'task' as alias for 'prompt'
    description,
    subagent_type = 'coder',
    model,
    resume,
    max_iterations = 30,
    run_in_background = false,
    timeout_s = DEFAULT_TIMEOUT_S,
    ctx = {},
    depth: explicitDepth,
} = {}) {
    // Resolve prompt: prefer 'prompt', fall back to 'task' for backward compat.
    const resolvedPrompt = prompt || taskAlias
    if (!resolvedPrompt) {
        return { error: 'prompt is required', depth: (explicitDepth ?? ctx.depth ?? 0) + 1, agent_id: 'unknown' }
    }

    const depth = explicitDepth ?? (ctx.depth || 0) + 1
    const timeoutSec = normalizeTimeout(timeout_s)
    const created_at = new Date().toISOString()

    // Handle resume: load persisted state and build continuation.
    let agentId, taskPrompt, initialMessages = [], resumeUsed = false
    if (resume) {
        const prev = await loadSubagent(resume)
        if (!prev) {
            return { error: `subagent not found for resume: ${resume}`, depth, agent_id: resume }
        }
        agentId = resume
        taskPrompt = buildResumePrompt(prev)
        resumeUsed = true
        // Persist that we're resuming
        await persistSubagent({
            agent_id: agentId,
            subagent_type: prev.subagent_type || subagent_type,
            task: taskPrompt,
            description: description || prev.description || 'resumed',
            model: model || prev.model,
            status: 'running',
            created_at: prev.created_at || created_at,
            depth,
            messages: [],
            result: null,
            error: null,
            iterations: null,
            timed_out: false,
        })
    } else {
        agentId = generateAgentId()
        taskPrompt = resolvedPrompt
    }

    if (depth > MAX_DEPTH) {
        return { error: `delegate recursion depth exceeded (${MAX_DEPTH})`, depth, agent_id: agentId }
    }

    // Ensure agent specs are loaded (YAML files merged with built-in defaults).
    const market = LaborMarket.instance
    await market.init()
    const typeDef = market.getType(subagent_type)
    if (!typeDef) {
        return { error: `unknown subagent_type: ${subagent_type}. Available: ${market.listTypes().map(t => t.name).join(', ')}`, depth, agent_id: agentId }
    }

    // Build the system prompt with the type's system prompt addition.
    const systemPrompt = typeDef.systemPromptAddition || ''
    const messages = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []

    // Collect git context for explore subagents.
    let gitContext = ''
    if (subagent_type === 'explore') {
        gitContext = await collectGitContext()
    }

    // Determine disabled tools based on the type's tool policy.
    let disabledTools = []
    if (typeDef.toolPolicy && typeDef.toolPolicy.mode === 'allowlist') {
        const allowSet = new Set(typeDef.toolPolicy.tools)
        const allTools = await getEnabledToolNames(['core'])
        disabledTools = allTools.filter(t => !allowSet.has(t))
    }

    // Build the framed prompt with optional git context.
    const framedPrompt = `${gitContext}${taskPrompt}\n\n[subagent type: ${subagent_type}${typeDef.description ? ' — ' + typeDef.description : ''}]`

    // Resolve model: use explicit model, or type's defaultModel, or inherit from parent.
    const resolvedModel = model || typeDef.defaultModel || undefined

    const turnFn = () => runTurn({
        prompt: framedPrompt,
        model: resolvedModel,
        callLLM: ctx.callLLM,
        messages: [...messages, ...initialMessages],
        disabledToolsets: disabledTools,
        maxIterations: max_iterations,
        timeoutMs: timeoutSec * 1000,
        toolCtx: { ...ctx, depth },
    })

    // Persist initial state as 'running' before starting.
    await persistSubagent({
        agent_id: agentId,
        subagent_type,
        task: resolvedPrompt,
        description: description || null,
        model: resolvedModel || null,
        status: 'running',
        created_at: resumeUsed ? undefined : created_at,
        depth,
        messages: [],
        result: null,
        error: null,
        iterations: null,
        timed_out: false,
    })

    telemetry.subagentCreated({ agent_id: agentId, subagent_type, depth, background: run_in_background })

    if (run_in_background) {
        return runSubagentInBackground({
            turnFn,
            ctx,
            agentId,
            subagent_type,
            resolvedPrompt,
            description,
            resolvedModel,
            resumeUsed,
            created_at,
            depth,
            messages,
            disabledTools,
            max_iterations,
            timeoutSec,
        })
    }

    // Foreground: run and wait for result.
    return runSubagentInForeground({
        turnFn,
        ctx,
        agentId,
        subagent_type,
        resolvedPrompt,
        description,
        resolvedModel,
        resumeUsed,
        created_at,
        depth,
        messages,
        disabledTools,
        max_iterations,
        timeoutSec,
    })
}

// Re-export store functions for external use.
export { loadSubagent, persistSubagent, generateAgentId }
