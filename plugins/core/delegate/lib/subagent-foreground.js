/**
 * Foreground (await-and-return) execution path for the subagent runner.
 * Extracted from runner.js to keep each file under the 200-line cap.
 */

import { runTurn } from '../../../../src/agent/machine.js'
import { persistSubagent } from '../store.js'
import { buildContinuationPrompt } from './subagent-helpers.js'
import { emitTurnEvent } from '../../../../src/agent/events.js'
import { redactSecrets } from '../../../../src/auth.js'

const CONTINUATION_MIN_CHARS = 200

/**
 * Run a subagent turn to completion, persist final state, and return the result.
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
 * @returns {Promise<{result?:string, error?:string, iterations?:number, depth:number, agent_id:string, subagent_type:string, timed_out?:boolean}>}
 */
export async function runSubagentInForeground({
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
        emitTurnEvent(ctx.sessionKey, 'subagent.end', { agent_id: agentId, subagent_type, depth, status: 'error', error: redactSecrets(err?.message || String(err)) })
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
    emitTurnEvent(ctx.sessionKey, 'subagent.end', { agent_id: agentId, subagent_type, depth, status, error: out.error ? redactSecrets(out.error) : null, iterations: out.iterations, timed_out: isTimeout })

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
