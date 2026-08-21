/**
 * Fire-and-forget background execution path for the subagent runner.
 * Extracted from runner.js to keep each file under the 200-line cap.
 */

import { runTurn } from '../../../../src/agent/machine.js'
import { persistSubagent } from '../store.js'
import { buildContinuationPrompt } from './subagent-helpers.js'
import { emitTurnEvent } from '../../../../src/agent/events.js'
import { redactSecrets } from '../../../../src/auth.js'

const CONTINUATION_MIN_CHARS = 200

/**
 * Start a subagent turn in the background and return immediately.
 * Persists final state (completed/error/timed_out) once the turn settles.
 *
 * @param {object} args
 * @param {Function} args.turnFn - () => Promise<{result,error,iterations,messages}>
 * @param {object} args.ctx - parent tool context (callLLM, etc.)
 * @param {string} args.agentId
 * @param {string} args.subagent_type
 * @param {string} args.resolvedPrompt
 * @param {string|null} args.description
 * @param {string|null} args.resolvedModel
 * @param {boolean} args.resumeUsed
 * @param {string} args.created_at
 * @param {number} args.depth
 * @param {Array} args.messages
 * @param {Array} args.disabledTools
 * @param {number} args.max_iterations
 * @param {number} args.timeoutSec
 * @returns {{result:string, background:true, task_id:string, agent_id:string, depth:number, subagent_type:string}}
 */
export function runSubagentInBackground({
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
}) {
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
        emitTurnEvent(ctx.sessionKey, 'subagent.end', { agent_id: agentId, subagent_type, depth, status, error: out.error ? redactSecrets(out.error) : null, iterations: out.iterations, timed_out: status === 'timed_out' })
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
        emitTurnEvent(ctx.sessionKey, 'subagent.end', { agent_id: agentId, subagent_type, depth, status: 'error', error: redactSecrets(err?.message || String(err)) })
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
