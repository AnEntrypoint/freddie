import { estimateMessagesTokens, estimateToolSchemaTokens } from './tokens.js'
import { isSafeCut } from './blocks.js'

export const MINIMUM_CONTEXT_LENGTH = 8000
export const SUMMARY_RATIO = 0.20
export const MIN_SUMMARY_TOKENS = 2000
export const SUMMARY_TOKENS_CEILING = 12000
export const COMPRESSION_THRESHOLD = 0.85
// Above this, the async LLM-driven compress() summarize path is itself a
// risk: the turn is already critically over budget, and waiting tens of
// seconds for a summarizer call (which needs its own request headroom) can
// push a request over the model's hard context ceiling before it returns.
// HARD_COMPRESSION_THRESHOLD marks the point where a caller should prefer
// immediate, synchronous pruning (pruneOldToolResults) over waiting on
// compress(), mirroring jcode.sh's 80%/95% soft-background/hard-emergency
// split (lib.rs COMPACTION_THRESHOLD/CRITICAL_THRESHOLD).
export const HARD_COMPRESSION_THRESHOLD = 0.95

// usableContextLength: modelContextLength minus reserved tool-schema
// overhead (see tokens.js::estimateToolSchemaTokens) -- computed once here
// so both tiers check against the same actually-available budget instead of
// the model's raw window, which double-counts headroom the tool schemas
// already consumed.
function usableContextLength(modelContextLength, tools) {
    const overhead = estimateToolSchemaTokens(tools)
    return Math.max(MINIMUM_CONTEXT_LENGTH, modelContextLength - overhead)
}

// Returns null (no compaction needed), 'soft' (background summarize is
// fine), or 'hard' (prefer immediate synchronous pruning -- see the
// HARD_COMPRESSION_THRESHOLD comment above). `tools` is the caller's
// resolved enabled-tool-schema array (optional; omitted = no overhead
// reservation, same as before this function existed).
export function compressionTier({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, tools = [], threshold = COMPRESSION_THRESHOLD, hardThreshold = HARD_COMPRESSION_THRESHOLD } = {}) {
    if (!Array.isArray(messages) || messages.length < 4) return null
    const used = estimateMessagesTokens(messages)
    const usable = usableContextLength(modelContextLength, tools)
    if (used >= usable * hardThreshold) return 'hard'
    if (used >= usable * threshold) return 'soft'
    return null
}

export function shouldCompress({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, tools = [], threshold = COMPRESSION_THRESHOLD } = {}) {
    if (!Array.isArray(messages) || messages.length < 4) return false
    const used = estimateMessagesTokens(messages)
    return used >= usableContextLength(modelContextLength, tools) * threshold
}

export function computeCompressionPlan(messages, modelContextLength = MINIMUM_CONTEXT_LENGTH) {
    const total = messages.length
    if (total < 4) return { head: messages, middle: [], tail: [], summaryBudget: 0 }
    const headCount = headCutoff(messages)
    const tailCount = tailCutoffByTokens(messages, headCount, modelContextLength)
    const head = messages.slice(0, headCount)
    const tail = messages.slice(total - tailCount)
    const middle = messages.slice(headCount, total - tailCount)
    const middleTokens = estimateMessagesTokens(middle)
    const rawBudget = Math.floor(middleTokens * SUMMARY_RATIO)
    const summaryBudget = Math.min(SUMMARY_TOKENS_CEILING, Math.max(MIN_SUMMARY_TOKENS, rawBudget))
    return { head, middle, tail, summaryBudget }
}

function headCutoff(messages) {
    let i = 0
    while (i < messages.length && messages[i].role === 'system') i++
    if (i + 1 < messages.length && messages[i].role === 'user') i++
    return Math.min(i, messages.length)
}

// The tail boundary (messages.length - count) must be a safe cut -- same
// tool_call/tool_result pairing guarantee blocks.js::isSafeCut already
// enforces for the middle-block split. Left unguarded, a token-budget-only
// cutoff can land between an assistant message's tool_calls and its tool
// results (the results end up in the discarded/summarized `middle`, leaving
// a dangling, unpaired tool_calls in `tail` -- most provider APIs reject
// that on the next request). Widen the tail (never narrow past the 2-message
// floor) until the boundary is safe, rather than trusting the raw token
// count.
function tailCutoffByTokens(messages, minIndex, contextLen) {
    const tailBudgetTokens = Math.floor(Math.max(MINIMUM_CONTEXT_LENGTH, contextLen) * 0.20)
    let used = 0
    let count = 0
    for (let i = messages.length - 1; i >= minIndex; i--) {
        const t = estimateMessagesTokens([messages[i]])
        if (used + t > tailBudgetTokens && count >= 2 && isSafeCut(messages, i + 1)) break
        used += t
        count++
    }
    // Loop may exit at minIndex with an unsafe boundary if pairing never
    // resolved within [minIndex, messages.length) -- widen to the full
    // remaining range in that case rather than emit a bad cut silently.
    while (count < messages.length - minIndex && !isSafeCut(messages, messages.length - count)) count++
    return Math.max(2, count)
}
