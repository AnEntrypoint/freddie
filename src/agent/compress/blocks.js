import { estimateMessageTokens, estimateMessagesTokens, CHARS_PER_TOKEN } from './tokens.js'

// Block-wise parallel compaction (arXiv:2605.23296 findings): the middle
// section is split into blocks, each summarized by an independent LLM call
// run in parallel (bounded concurrency), and each block's summary is held to
// an explicit token budget enforced DETERMINISTICALLY — prompt-instructed
// length is largely ignored by models, so the budget is applied by slicing
// the returned text, not by trusting the instruction.

// Source-token target per block. Sized at the MINIMUM_CONTEXT_LENGTH scale so
// a block is a comfortably small single summarizer input; blocks may exceed it
// when a tool_call/tool-result group straddles the boundary (pairing is never
// sacrificed for size precision).
export const BLOCK_SOURCE_TOKENS = 8000
export const BLOCK_CONCURRENCY = 4
export const MIN_BLOCK_SUMMARY_TOKENS = 200

// A cut BEFORE index i is unsafe when it would separate an assistant
// tool_call from its tool results: either the next message is a tool result
// (its call lives behind the cut), or the previous message is an assistant
// message with tool_calls (its results live ahead of the cut).
function isSafeCut(messages, i) {
    const prev = messages[i - 1]
    const next = messages[i]
    if (next?.role === 'tool') return false
    if (prev?.role === 'assistant' && Array.isArray(prev.tool_calls) && prev.tool_calls.length) return false
    return true
}

// Split the middle section into blocks by token estimate (tokens.js
// accounting), cutting only at safe boundaries so tool_call/tool pairing is
// preserved within every block.
export function splitMiddleIntoBlocks(middle, blockSourceTokens = BLOCK_SOURCE_TOKENS) {
    if (!Array.isArray(middle) || middle.length === 0) return []
    const blocks = []
    let start = 0
    let used = 0
    for (let i = 0; i < middle.length; i++) {
        used += estimateMessageTokens(middle[i])
        if (used >= blockSourceTokens && i + 1 < middle.length && isSafeCut(middle, i + 1)) {
            blocks.push(middle.slice(start, i + 1))
            start = i + 1
            used = 0
        }
    }
    if (start < middle.length) blocks.push(middle.slice(start))
    return blocks
}

// Distribute the overall summary budget across blocks proportionally to each
// block's source size, with a floor so small blocks still keep usable detail.
export function allocateBlockBudgets(blocks, summaryBudget) {
    if (!blocks.length) return []
    const sizes = blocks.map(b => estimateMessagesTokens(b))
    const total = sizes.reduce((a, b) => a + b, 0) || 1
    return sizes.map(s => Math.max(MIN_BLOCK_SUMMARY_TOKENS, Math.floor(summaryBudget * s / total)))
}

// Deterministic budget enforcement: never trust the model's compliance with
// the instructed length. Slices the produced summary so its character volume
// stays within budgetTokens * CHARS_PER_TOKEN, preferring a line boundary in
// the tail for a clean cut (only ever cuts EARLIER, never past the limit).
export function enforceTokenBudget(text, budgetTokens) {
    if (typeof text !== 'string') return ''
    const maxChars = Math.max(0, Math.floor(budgetTokens * CHARS_PER_TOKEN))
    if (text.length <= maxChars) return text
    let cut = maxChars
    const lastNewline = text.lastIndexOf('\n', maxChars)
    if (lastNewline >= Math.floor(maxChars * 0.8)) cut = lastNewline
    return text.slice(0, cut)
}

// mapWithConcurrency: Promise.all-style parallel execution bounded to `limit`
// in-flight calls, results returned in input order.
export async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length)
    let next = 0
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const i = next++
            results[i] = await fn(items[i], i)
        }
    })
    await Promise.all(workers)
    return results
}
