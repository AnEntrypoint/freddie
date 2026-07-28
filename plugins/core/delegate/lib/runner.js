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

const MAX_DEPTH = 3
const CONTINUATION_MIN_CHARS = 200
const DEFAULT_TIMEOUT_S = 600
const MIN_TIMEOUT_S = 30
const MAX_TIMEOUT_S = 3600

// Browser detection: skip filesystem-dependent operations in browser.
const _isBrowser = typeof window !== 'undefined' || typeof importScripts === 'function'

/**
 * Generate a unique agent ID.
 * Uses crypto.randomUUID() when available (Node.js 19+, modern browsers),
 * falls back to a timestamp + random string.
 * @returns {string}
 */
function generateAgentId() {
    try {
        return crypto.randomUUID()
    } catch {
        return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    }
}

/**
 * Normalize and validate timeout_s.
 * @param {number} val
 * @returns {number}
 */
function normalizeTimeout(val) {
    if (val === undefined || val === null) return DEFAULT_TIMEOUT_S
    const n = Number(val)
    if (!Number.isFinite(n) || n < MIN_TIMEOUT_S) return MIN_TIMEOUT_S
    if (n > MAX_TIMEOUT_S) return MAX_TIMEOUT_S
    return n
}

/**
 * Collect git context for explore subagents.
 * Runs git commands to get branch, status, and recent commits.
 * Gracefully degrades in browser (returns empty string).
 * @returns {Promise<string>}
 */
async function collectGitContext() {
    if (_isBrowser) return ''
    try {
        const { execFileSync } = await import('node:child_process')
        const opts = { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 }
        const run = (args) => {
            try { return execFileSync('git', args, opts).trim() } catch { return '' }
        }
        const branch = run(['branch', '--show-current'])
        const status = run(['status', '--porcelain'])
        const log = run(['log', '--oneline', '-5'])
        if (!branch && !status && !log) return ''
        const parts = []
        if (branch) parts.push(`Branch: ${branch}`)
        if (status) parts.push(`Dirty files:\n${status}`)
        if (log) parts.push(`Recent commits:\n${log}`)
        if (!parts.length) return ''
        return `<git-context>\n${parts.join('\n\n')}\n</git-context>\n\n`
    } catch {
        return ''
    }
}

/**
 * Build a continuation prompt for subagents whose output was too brief.
 * @param {string} originalResult
 * @returns {string}
 */
function buildContinuationPrompt(originalResult) {
    return `Your previous answer was brief:\n\n---\n${originalResult}\n---\n\nPlease expand on this with more detail. Provide a thorough, complete response.`
}

/**
 * Build a resume prompt for a subagent being resumed.
 * @param {object} prev - the persisted subagent entry
 * @returns {string}
 */
function buildResumePrompt(prev) {
    const parts = [`You are resuming a previous subagent task.`]
    if (prev.task) parts.push(`Original task: ${prev.task}`)
    if (prev.result) parts.push(`Previous result: ${prev.result}`)
    if (prev.error) parts.push(`Previous error: ${prev.error}`)
    parts.push(`Continue from where you left off, completing the task or providing more detail.`)
    return parts.join('\n\n')
}

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
            return {
                error: `subagent not found for resume: ${resume}`,
                depth,
                agent_id: resume,
            }
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
        return {
            error: `unknown subagent_type: ${subagent_type}. Available: ${market.listTypes().map(t => t.name).join(', ')}`,
            depth,
            agent_id: agentId,
        }
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
        // Fire-and-forget: start the subagent but return immediately.
        const taskId = `delegate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        turnFn().then(async (out) => {
            const completed_at = new Date().toISOString()
            const status = out.error ? (out.error.includes('timeout') ? 'timed_out' : 'error') : 'completed'
            // Check for continuation if output is brief.
            let finalResult = out.result
            if (!out.error && finalResult && finalResult.length < CONTINUATION_MIN_CHARS) {
                try {
                    const contPrompt = buildContinuationPrompt(finalResult)
                    const contOut = await runTurn({
                        prompt: contPrompt,
                        model: resolvedModel,
                        callLLM: ctx.callLLM,
                        messages: [...messages],
                        disabledToolsets: disabledTools,
                        maxIterations: max_iterations,
                        timeoutMs: timeoutSec * 1000,
                        toolCtx: { ...ctx, depth },
                    })
                    if (contOut.result) {
                        finalResult = finalResult + '\n\n' + contOut.result
                    }
                } catch (_) { /* continuation failed, keep original result */ }
            }
            await persistSubagent({
                agent_id: agentId,
                subagent_type,
                task: resolvedPrompt,
                description: description || null,
                model: resolvedModel || null,
                status,
                created_at: resumeUsed ? undefined : created_at,
                completed_at,
                depth,
                messages: out.messages || [],
                result: finalResult,
                error: out.error || null,
                iterations: out.iterations,
                timed_out: status === 'timed_out',
            })
        }).catch(async (err) => {
            await persistSubagent({
                agent_id: agentId,
                subagent_type,
                task: resolvedPrompt,
                description: description || null,
                model: resolvedModel || null,
                status: 'error',
                created_at: resumeUsed ? undefined : created_at,
                completed_at: new Date().toISOString(),
                depth,
                messages: [],
                result: null,
                error: err?.message || String(err),
                iterations: null,
                timed_out: false,
            })
        })
        return {
            result: `Subagent started in background (task_id: ${taskId}, agent_id: ${agentId}). Type: ${subagent_type}.`,
            background: true,
            task_id: taskId,
            agent_id: agentId,
            depth,
            subagent_type,
        }
    }

    // Foreground: run and wait for result.
    let out
    try {
        out = await turnFn()
    } catch (err) {
        await persistSubagent({
            agent_id: agentId,
            subagent_type,
            task: resolvedPrompt,
            description: description || null,
            model: resolvedModel || null,
            status: 'error',
            created_at: resumeUsed ? undefined : created_at,
            completed_at: new Date().toISOString(),
            depth,
            messages: [],
            result: null,
            error: err?.message || String(err),
            iterations: null,
            timed_out: false,
        })
        return {
            result: null,
            error: err?.message || String(err),
            iterations: 0,
            depth,
            agent_id: agentId,
            subagent_type,
        }
    }

    // Check for timeout.
    const isTimeout = out.error && out.error.includes('timeout')

    // Output continuation: if result is brief and no error, run one more turn.
    let finalResult = out.result
    if (!isTimeout && !out.error && finalResult && finalResult.length < CONTINUATION_MIN_CHARS) {
        try {
            const contPrompt = buildContinuationPrompt(finalResult)
            const contOut = await runTurn({
                prompt: contPrompt,
                model: resolvedModel,
                callLLM: ctx.callLLM,
                messages: [...messages],
                disabledToolsets: disabledTools,
                maxIterations: max_iterations,
                timeoutMs: timeoutSec * 1000,
                toolCtx: { ...ctx, depth },
            })
            if (contOut.result) {
                finalResult = finalResult + '\n\n' + contOut.result
            }
        } catch (_) { /* continuation failed, keep original result */ }
    }

    // Persist final state.
    const completed_at = new Date().toISOString()
    const status = isTimeout ? 'timed_out' : (out.error ? 'error' : 'completed')
    await persistSubagent({
        agent_id: agentId,
        subagent_type,
        task: resolvedPrompt,
        description: description || null,
        model: resolvedModel || null,
        status,
        created_at: resumeUsed ? undefined : created_at,
        completed_at,
        depth,
        messages: out.messages || [],
        result: finalResult,
        error: out.error || null,
        iterations: out.iterations,
        timed_out: isTimeout,
    })

    return {
        result: finalResult,
        error: out.error || null,
        iterations: out.iterations,
        depth,
        agent_id: agentId,
        subagent_type,
        timed_out: isTimeout,
    }
}

// Re-export store functions for external use.
export { loadSubagent, persistSubagent, generateAgentId }