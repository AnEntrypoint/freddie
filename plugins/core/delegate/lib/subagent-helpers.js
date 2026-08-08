/**
 * Small stateless helpers for the subagent runner: id generation, timeout
 * normalization, prompt building, and git context collection.
 * Extracted from runner.js to keep each file under the 200-line cap.
 *
 * Browser-compatible: all state in-memory, no filesystem calls for git context.
 */

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
export function generateAgentId() {
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
export function normalizeTimeout(val) {
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

export { DEFAULT_TIMEOUT_S, MIN_TIMEOUT_S, MAX_TIMEOUT_S }
