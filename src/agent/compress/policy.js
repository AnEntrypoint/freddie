import { estimateMessagesTokens } from './tokens.js'

export const MINIMUM_CONTEXT_LENGTH = 8000
export const SUMMARY_RATIO = 0.20
export const MIN_SUMMARY_TOKENS = 2000
export const SUMMARY_TOKENS_CEILING = 12000
export const COMPRESSION_THRESHOLD = 0.85

export function shouldCompress({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, threshold = COMPRESSION_THRESHOLD } = {}) {
    if (!Array.isArray(messages) || messages.length < 4) return false
    const used = estimateMessagesTokens(messages)
    return used >= Math.max(MINIMUM_CONTEXT_LENGTH, modelContextLength) * threshold
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

function tailCutoffByTokens(messages, minIndex, contextLen) {
    const tailBudgetTokens = Math.floor(Math.max(MINIMUM_CONTEXT_LENGTH, contextLen) * 0.20)
    let used = 0
    let count = 0
    for (let i = messages.length - 1; i >= minIndex; i--) {
        const t = estimateMessagesTokens([messages[i]])
        if (used + t > tailBudgetTokens && count >= 2) break
        used += t
        count++
    }
    return Math.max(2, count)
}
