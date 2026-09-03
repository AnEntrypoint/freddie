/**
 * Small stateless helpers for the subagent runner: id generation, timeout
 * normalization, prompt building, and git context collection.
 * Extracted from runner.js to keep each file under the 200-line cap.
 *
 * Browser-compatible: all state in-memory, no filesystem calls for git context.
 */

// DEFAULT_TIMEOUT_S raised 600 -> 1800: llm_resolver.js's own per-call
// retry budget (SAMPLER_MAX_ESCALATION_MS) is 15 minutes -- a subagent
// default shorter than that meant a SINGLE retried LLM call inside one
// iteration could alone consume the whole subagent timeout before any
// real multi-iteration work happened, live-witnessed as delegate calls
// timing out at 27-30 iterations with "agent turn timeout". 1800s gives
// real headroom above that one-call worst case for genuine multi-
// iteration work, not just barely covering it.
//
// No MAX_TIMEOUT_S anymore -- subagents must be able to run long-horizon
// work the same way the top-level TUI turn already can (driveAgentActor's
// own timeoutMs===Infinity/no-timer convention). Per direct user
// instruction ("make it infinite instead of 24h"), timeout_s: 0 means
// UNBOUNDED, not a large-but-finite fallback -- normalizeTimeout passes 0
// straight through, and runner.js/subagent-foreground.js's `timeoutSec *
// 1000` becomes `0`, which driveAgentActor's own `!Number.isFinite(timeoutMs)
// || timeoutMs <= 0` noTimeout check already treats as "skip the timer
// entirely" (the exact mechanism the interactive TUI's own Infinity value
// already relies on) -- no new plumbing needed at that layer, this file
// only needed to stop clamping 0 up to a fallback number. The per-CALL LLM
// retry ceiling (llm_resolver.js's own SAMPLER_MAX_ESCALATION_MS, 15min)
// remains the separate mechanism bounding any ONE call's own worst case --
// a subagent with no turn-level ceiling still can't have a single LLM call
// hang forever, that bound lives one layer down and is unaffected by this.
const DEFAULT_TIMEOUT_S = 1800
const MIN_TIMEOUT_S = 30
const UNBOUNDED_TIMEOUT_S = 0

// Browser detection: skip filesystem-dependent operations in browser.
const _isBrowser = typeof window !== 'undefined' || typeof importScripts === 'function'

/**
 * Generate a unique agent ID.
 * Uses crypto.randomUUID() when available (Node.js 19+, modern browsers),
 * falls back to a timestamp + random string.
 * @returns {string}
 */
export function generateAgentId() {
    try {
        return crypto.randomUUID()
    } catch {
        return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    }
}

/**
 * Normalize and validate timeout_s. 0 means UNBOUNDED (see the module
 * header comment) -- checked BEFORE the MIN_TIMEOUT_S floor so an
 * explicit 0 is never clamped up to 30s; any other sub-MIN value keeps
 * being clamped, since that's a real mistyped-small-number case (e.g. 5),
 * not a deliberate "no limit" request.
 * @param {number} val
 * @returns {number}
 */
export function normalizeTimeout(val) {
    if (val === undefined || val === null) return DEFAULT_TIMEOUT_S
    const n = Number(val)
    if (n === UNBOUNDED_TIMEOUT_S) return UNBOUNDED_TIMEOUT_S
    if (!Number.isFinite(n) || n < MIN_TIMEOUT_S) return MIN_TIMEOUT_S
    return n
}

/**
 * Collect git context for explore subagents.
 * Runs git commands to get branch, status, and recent commits.
 * Gracefully degrades in browser (returns empty string).
 * @returns {Promise<string>}
 */
export async function collectGitContext() {
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
export function buildContinuationPrompt(originalResult) {
    return `Your previous answer was brief:\n\n---\n${originalResult}\n---\n\nPlease expand on this with more detail. Provide a thorough, complete response.`
}

/**
 * Build a resume prompt for a subagent being resumed.
 * @param {object} prev - the persisted subagent entry
 * @returns {string}
 */
export function buildResumePrompt(prev) {
    const parts = [`You are resuming a previous subagent task.`]
    if (prev.task) parts.push(`Original task: ${prev.task}`)
    if (prev.result) parts.push(`Previous result: ${prev.result}`)
    if (prev.error) parts.push(`Previous error: ${prev.error}`)
    parts.push(`Continue from where you left off, completing the task or providing more detail.`)
    return parts.join('\n\n')
}

export { DEFAULT_TIMEOUT_S, MIN_TIMEOUT_S, UNBOUNDED_TIMEOUT_S }
