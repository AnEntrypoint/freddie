import { shouldCompress, computeCompressionPlan, compressionTier, MINIMUM_CONTEXT_LENGTH } from './policy.js'
import { pruneOldToolResults } from './prune.js'
import { SUMMARY_PREFIX, LEGACY_SUMMARY_PREFIX, SUMMARIZER_SYSTEM_PROMPT, buildSummarizerInput } from './prompt.js'
import { markFailure, shouldRetry } from './fallback.js'
import { splitMiddleIntoBlocks, allocateBlockBudgets, enforceTokenBudget, mapWithConcurrency, BLOCK_SOURCE_TOKENS, BLOCK_CONCURRENCY } from './blocks.js'
import { estimateMessagesTokens, CHARS_PER_TOKEN } from './tokens.js'
import { logger } from '../../observability/log.js'

const log = logger('compressor')

export async function compress({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, callLLM, auxModel = null, tools = [], threshold, blockSourceTokens = BLOCK_SOURCE_TOKENS, blockConcurrency = BLOCK_CONCURRENCY } = {}) {
    const tier = compressionTier({ messages, modelContextLength, tools, threshold })
    if (!tier) return { compressedMessages: messages, summary: null, didCompress: false, reason: 'below threshold' }
    // hard tier: the turn is critically over budget (>=95% of usable context
    // by default) -- waiting on the async LLM summarize path below risks the
    // request itself blowing the model's context ceiling before a summary
    // ever comes back, and every extra second here is a second the caller's
    // own turn timeout is burning. Prune tool-result content synchronously
    // (cheap, no LLM round-trip, safe by construction -- see prune.js) as an
    // immediate stopgap; the NEXT turn's soft-tier check still runs the real
    // summarize compaction below once the emergency has passed.
    if (tier === 'hard') {
        const pruned = pruneOldToolResults(messages, 2)
        const actuallyPruned = pruned.some((m, i) => m.content !== messages[i].content)
        if (actuallyPruned) return { compressedMessages: pruned, summary: null, didCompress: true, tier: 'hard', reason: 'emergency prune' }
        // Nothing left to prune (fewer than 2 tool results already) -- fall
        // through to the real summarize path below; hard tier only skips
        // AHEAD of the wait when a cheap synchronous win is available.
    }
    if (!shouldRetry()) return { compressedMessages: messages, summary: null, didCompress: false, reason: 'cooldown' }
    if (typeof callLLM !== 'function') throw new Error('compress: callLLM required')

    const plan = computeCompressionPlan(messages, modelContextLength)
    if (plan.middle.length === 0) return { compressedMessages: messages, summary: null, didCompress: false, reason: 'no middle' }

    const existing = extractExistingSummary(plan.head)
    const prunedMiddle = pruneOldToolResults(plan.middle, 0)

    // Block-wise parallel compaction (arXiv:2605.23296): instead of ONE
    // sequential summarize-everything call (which stalls the turn for tens of
    // seconds and returns a summary whose length the model picks at will),
    // the middle is split at tool_call-safe boundaries, each block is
    // summarized by an independent call run with bounded concurrency, and each
    // block's summary is held to an explicit share of the overall budget by
    // deterministic truncation (enforceTokenBudget) — the instructed length is
    // a hint, the slice is the guarantee.
    const blocks = splitMiddleIntoBlocks(prunedMiddle, blockSourceTokens)
    const budgets = allocateBlockBudgets(blocks, plan.summaryBudget)

    let blockSummaries
    try {
        blockSummaries = await mapWithConcurrency(blocks, blockConcurrency, async (block, i) => {
            const budget = budgets[i]
            const budgetLine = `Length limit: this block's summary MUST be under ${budget} tokens (≈${budget * CHARS_PER_TOKEN} characters). Shorter is better — this is a hard cap, anything past it is discarded.`
            const preamble = (i === 0 && existing) ? `Previous summary:\n${existing}\n\nNew turns to fold in:\n` : ''
            const blockLabel = blocks.length > 1 ? `This is block ${i + 1} of ${blocks.length} from the same conversation; summarize only what is in this block.\n\n` : ''
            const summarizerMessages = [
                { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
                { role: 'user', content: budgetLine + '\n\n' + blockLabel + preamble + buildSummarizerInput(block) },
            ]
            // max_tokens (snake) reaches resolveCallLLM/acptoapi; maxTokens
            // (camel) is kept for external callLLM consumers of the old shape.
            const out = await callLLM({ messages: summarizerMessages, tools: [], model: auxModel, maxTokens: budget, max_tokens: budget })
            const raw = (out?.content || '').trim()
            if (!raw) throw new Error('empty summary')
            return enforceTokenBudget(raw, budget)
        })
    } catch (e) {
        markFailure()
        log.error('summarization failed', { err: String(e) })
        return { compressedMessages: messages, summary: null, didCompress: false, error: String(e) }
    }

    const summary = blockSummaries.join('\n\n')
    const headWithoutOldSummary = stripExistingSummary(plan.head)
    const summaryMsg = { role: 'user', content: `${SUMMARY_PREFIX}\n\n${summary}` }
    const compressedMessages = [...headWithoutOldSummary, summaryMsg, ...plan.tail]
    const blockInfo = blocks.map((b, i) => ({ index: i, messages: b.length, sourceTokens: estimateMessagesTokens(b), budget: budgets[i], summaryChars: blockSummaries[i].length }))
    log.info('compressed', { in: messages.length, out: compressedMessages.length, blocks: blocks.length, summary_chars: summary.length })
    return { compressedMessages, summary, didCompress: true, plan, blocks: blockInfo }
}

function extractExistingSummary(head) {
    for (const m of head) {
        const c = typeof m.content === 'string' ? m.content : ''
        if (c.startsWith(SUMMARY_PREFIX)) return c.slice(SUMMARY_PREFIX.length).trim()
        if (c.startsWith(LEGACY_SUMMARY_PREFIX)) return c.slice(LEGACY_SUMMARY_PREFIX.length).trim()
    }
    return null
}

function stripExistingSummary(head) {
    return head.filter(m => {
        const c = typeof m.content === 'string' ? m.content : ''
        return !c.startsWith(SUMMARY_PREFIX) && !c.startsWith(LEGACY_SUMMARY_PREFIX)
    })
}
