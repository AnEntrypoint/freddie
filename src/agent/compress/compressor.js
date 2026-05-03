import { shouldCompress, computeCompressionPlan, MINIMUM_CONTEXT_LENGTH } from './policy.js'
import { pruneOldToolResults } from './prune.js'
import { SUMMARY_PREFIX, LEGACY_SUMMARY_PREFIX, SUMMARIZER_SYSTEM_PROMPT, buildSummarizerInput } from './prompt.js'
import { markFailure, shouldRetry } from './fallback.js'
import { logger } from '../../observability/log.js'

const log = logger('compressor')

export async function compress({ messages, modelContextLength = MINIMUM_CONTEXT_LENGTH, callLLM, auxModel = null, threshold } = {}) {
    if (!shouldCompress({ messages, modelContextLength, threshold })) return { compressedMessages: messages, summary: null, didCompress: false, reason: 'below threshold' }
    if (!shouldRetry()) return { compressedMessages: messages, summary: null, didCompress: false, reason: 'cooldown' }
    if (typeof callLLM !== 'function') throw new Error('compress: callLLM required')

    const plan = computeCompressionPlan(messages, modelContextLength)
    if (plan.middle.length === 0) return { compressedMessages: messages, summary: null, didCompress: false, reason: 'no middle' }

    const existing = extractExistingSummary(plan.head)
    const prunedMiddle = pruneOldToolResults(plan.middle, 0)
    const summarizerMessages = [
        { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
        { role: 'user', content: (existing ? `Previous summary:\n${existing}\n\nNew turns to fold in:\n` : '') + buildSummarizerInput(prunedMiddle) },
    ]
    let summary
    try {
        const out = await callLLM({ messages: summarizerMessages, tools: [], model: auxModel, maxTokens: plan.summaryBudget })
        summary = (out?.content || '').trim()
        if (!summary) throw new Error('empty summary')
    } catch (e) {
        markFailure()
        log.error('summarization failed', { err: String(e) })
        return { compressedMessages: messages, summary: null, didCompress: false, error: String(e) }
    }

    const headWithoutOldSummary = stripExistingSummary(plan.head)
    const summaryMsg = { role: 'user', content: `${SUMMARY_PREFIX}\n\n${summary}` }
    const compressedMessages = [...headWithoutOldSummary, summaryMsg, ...plan.tail]
    log.info('compressed', { in: messages.length, out: compressedMessages.length, summary_chars: summary.length })
    return { compressedMessages, summary, didCompress: true, plan }
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
