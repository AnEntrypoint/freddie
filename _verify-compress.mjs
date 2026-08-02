// _verify-compress.mjs — live-code-path verification for block-wise parallel
// context compaction (src/agent/compress/{compressor,blocks}.js). Project
// doctrine: no test framework — this drives the REAL compress() with a
// scripted callLLM stub (no network) and asserts the observable contract:
//   (a) blocks are summarized IN PARALLEL (stub start timestamps overlap),
//       bounded by BLOCK_CONCURRENCY
//   (b) per-block summary volume NEVER exceeds the block's token budget, even
//       when the stub returns 10x the instructed length (deterministic
//       enforcement — the arXiv:2605.23296 failure being fixed)
//   (c) tool_call/tool pairing intact in the compressed output
//   (d) head and tail byte-identical to the input
// Run: node _verify-compress.mjs
//
// Exit 0 = all checks passed. Exit 1 = first failure (labeled).

import { compress, computeCompressionPlan, splitMiddleIntoBlocks, enforceTokenBudget, clearFailure, CHARS_PER_TOKEN, SUMMARY_PREFIX, BLOCK_CONCURRENCY } from './src/agent/compress/index.js'

let failures = 0
function check(label, cond) {
    if (cond) { console.log('  ok  ' + label) }
    else { failures++; console.error('FAIL  ' + label) }
}

const filler = (n, ch = 'y') => ch.repeat(n)

// Oversized synthetic conversation: system head + first user, then repeated
// (user, assistant+2 tool_calls, 2 tool results, assistant prose) groups with
// fat tool outputs, then a small tail. Well-formed pairing by construction.
function buildConversation(groups = 12) {
    const msgs = [
        { role: 'system', content: 'You are freddie, a coding agent. ' + filler(120) },
        { role: 'user', content: 'Please refactor the frobnicate module. ' + filler(80) },
    ]
    let n = 0
    for (let g = 0; g < groups; g++) {
        msgs.push({ role: 'user', content: `msg-${n++} step ${g}: now adjust file ${g}. ` + filler(200) })
        msgs.push({
            role: 'assistant',
            content: `msg-${n++} editing ${g}. ` + filler(150),
            tool_calls: [
                { id: `call-${g}-a`, name: 'read', arguments: { path: `src/f${g}.js` } },
                { id: `call-${g}-b`, name: 'bash', arguments: { cmd: `wc -l src/f${g}.js` } },
            ],
        })
        msgs.push({ role: 'tool', tool_call_id: `call-${g}-a`, content: `msg-${n++} file body ${g} ` + filler(1500) })
        msgs.push({ role: 'tool', tool_call_id: `call-${g}-b`, content: `msg-${n++} wc out ${g} ` + filler(1500) })
        msgs.push({ role: 'assistant', content: `msg-${n++} done with ${g}. ` + filler(500) })
    }
    msgs.push({ role: 'user', content: 'msg-' + n++ + ' anything else? ' + filler(150) })
    msgs.push({ role: 'assistant', content: 'msg-' + n++ + ' one more tweak. ' + filler(150) })
    return msgs
}

// Every assistant tool_call id is answered by a following tool message before
// the transcript ends, and no tool message is orphaned.
function pairingOk(messages) {
    const pending = new Set()
    for (const m of messages) {
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            for (const tc of m.tool_calls) pending.add(tc.id)
        } else if (m.role === 'tool') {
            if (!pending.has(m.tool_call_id)) return false
            pending.delete(m.tool_call_id)
        }
    }
    return pending.size === 0
}

// --- 1. block splitting never breaks tool_call/tool pairing -----------------
{
    const convo = buildConversation()
    const plan = computeCompressionPlan(convo)
    const blocks = splitMiddleIntoBlocks(plan.middle, 400)
    check('middle splits into multiple blocks', blocks.length >= 4)
    check('no block starts with a tool result', blocks.every(b => b[0].role !== 'tool'))
    check('no block ends with an unanswered tool_call', blocks.every(b => {
        const last = b[b.length - 1]
        return !(last.role === 'assistant' && Array.isArray(last.tool_calls) && last.tool_calls.length)
    }))
    check('blocks reassemble into the exact middle', JSON.stringify(blocks.flat()) === JSON.stringify(plan.middle))
    check('every block is internally pairing-safe', blocks.every(pairingOk))
}

// --- 2. deterministic budget enforcement ------------------------------------
{
    const budget = 100
    const maxChars = budget * CHARS_PER_TOKEN
    const oversized = 'line one\n' + filler(maxChars * 10, 'x')
    const enforced = enforceTokenBudget(oversized, budget)
    check('10x-too-long summary sliced to budget', enforced.length <= maxChars)
    check('short summary untouched', enforceTokenBudget('short', budget) === 'short')
    check('non-string coerced to empty', enforceTokenBudget(null, budget) === '')
}

// --- 3. full compress(): parallel, budgeted, pairing-safe, head/tail intact --
{
    clearFailure()
    const convo = buildConversation()
    const plan = computeCompressionPlan(convo)
    const calls = []
    let active = 0
    let maxActive = 0
    const LATENCY_MS = 120
    const callLLM = async ({ messages, maxTokens, max_tokens }) => {
        const budget = maxTokens || max_tokens
        const start = Date.now()
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise(r => setTimeout(r, LATENCY_MS))
        active--
        calls.push({ start, end: Date.now(), budget, rawChars: budget * CHARS_PER_TOKEN * 10 })
        const user = messages[messages.length - 1].content
        const firstId = (user.match(/msg-\d+/) || ['msg-?'])[0]
        // 10x the instructed length — the exact non-compliance being fixed.
        return { content: `BLOCKSUM first=${firstId}\n` + filler(budget * CHARS_PER_TOKEN * 10, 'z') }
    }
    const t0 = Date.now()
    const out = await compress({ messages: convo, callLLM, blockSourceTokens: 400, blockConcurrency: BLOCK_CONCURRENCY })
    const wallMs = Date.now() - t0

    check('compression triggered on oversized conversation', out.didCompress === true)
    check('multiple block summaries produced', Array.isArray(out.blocks) && out.blocks.length >= 4)
    check('one LLM call per block', calls.length === out.blocks.length)

    // (a) parallel: at least one pair of [start,end) intervals overlaps, and
    // in-flight count never exceeded the concurrency bound. Wall clock well
    // under the sequential cost.
    const overlapped = calls.some(a => calls.some(b => a !== b && a.start < b.end && b.start < a.end))
    check('(a) block calls overlap in time (parallel)', overlapped)
    check('(a) concurrency bounded at ' + BLOCK_CONCURRENCY, maxActive > 1 && maxActive <= BLOCK_CONCURRENCY)
    check('(a) wall time far below sequential cost', wallMs < calls.length * LATENCY_MS * 0.75)

    // (b) per-block volume never exceeds the block budget, despite the stub
    // returning 10x the instructed length for every block.
    check('(b) stub really returned ~10x budget every block', calls.every(c => c.rawChars >= c.budget * CHARS_PER_TOKEN * 10))
    check('(b) every block summary within its token budget', out.blocks.every(b => b.summaryChars <= b.budget * CHARS_PER_TOKEN))

    // block summaries concatenated in original conversation order
    const order = [...out.summary.matchAll(/BLOCKSUM first=msg-(\d+)/g)].map(m => Number(m[1]))
    check('block summaries concatenated in original order', order.length === out.blocks.length && order.every((v, i) => i === 0 || v > order[i - 1]))

    // (c) tool_call/tool pairing intact in the compressed message list
    check('(c) tool_call/tool pairing intact in output', pairingOk(out.compressedMessages))

    // (d) head and tail byte-identical to the input
    const headOut = out.compressedMessages.slice(0, plan.head.length)
    const tailOut = out.compressedMessages.slice(out.compressedMessages.length - plan.tail.length)
    check('(d) head byte-identical', JSON.stringify(headOut) === JSON.stringify(plan.head))
    check('(d) tail byte-identical', JSON.stringify(tailOut) === JSON.stringify(plan.tail))

    // summary message convention unchanged: single user message with the
    // SUMMARY_PREFIX between head and tail.
    const summaryMsg = out.compressedMessages[plan.head.length]
    check('summary re-enters as one SUMMARY_PREFIX user message', summaryMsg?.role === 'user' && typeof summaryMsg.content === 'string' && summaryMsg.content.startsWith(SUMMARY_PREFIX))
}

// --- 4. below threshold = no-op ----------------------------------------------
{
    clearFailure()
    const small = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'thanks' },
    ]
    const out = await compress({ messages: small, callLLM: async () => { throw new Error('must not be called') } })
    check('below-threshold conversation untouched', out.didCompress === false && out.compressedMessages === small)
}

// --- 5. block failure keeps the fail-whole + cooldown contract ----------------
{
    clearFailure()
    const convo = buildConversation()
    let n = 0
    const out = await compress({
        messages: convo, blockSourceTokens: 400,
        callLLM: async () => { n++; if (n === 2) throw new Error('provider exploded'); return { content: 'ok block' } },
    })
    check('a failing block aborts compression with error', out.didCompress === false && typeof out.error === 'string')
    check('failed compression returns original messages', out.compressedMessages === convo)
    const out2 = await compress({ messages: convo, blockSourceTokens: 400, callLLM: async () => ({ content: 'x' }) })
    check('cooldown blocks immediate retry', out2.didCompress === false && out2.reason === 'cooldown')
    clearFailure()
}

console.log(failures === 0 ? '\nALL COMPRESS CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
