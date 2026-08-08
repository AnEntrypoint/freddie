import { getConfigValue } from '../config.js'
import { MATRIX_FILE } from '../models/discovery.js'
import { callLLM as bridgeCall } from './acptoapi-bridge.js'
import { parseTextToolCalls } from './tool_call_text.js'
import { env } from '../env.js'
export { matrixUsable } from '../models/discovery.js'
import { sdk, PROVIDER_KEYS, DEFAULTS, warmExtraProviders, cachedReachable } from './llm_provider_warmup.js'
export { warmExtraProviders, PROVIDER_KEYS, DEFAULTS } from './llm_provider_warmup.js'

const toTools = s => s?.length ? s.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } })) : undefined

const toMsgs = ms => ms.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name || tc.function?.name, arguments: typeof (tc.arguments || tc.function?.arguments) === 'string' ? (tc.arguments || tc.function?.arguments) : JSON.stringify(tc.arguments || tc.function?.arguments || {}) } })) }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
    return m
})

const tryJson = s => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

function flattenContent(c) {
    // Anthropic-shape arrays (returned by ACP daemons routed through acptoapi)
    // come as [{ type: 'text', text: '...' }, { type: 'tool_use', ... }]. Pull
    // out concatenated text so the agent loop has something to display, and
    // surface tool_use blocks separately so callers can map them.
    if (typeof c === 'string') return { text: c, toolUses: [] }
    if (Array.isArray(c)) {
        const text = c.filter(p => p && (p.type === 'text' || typeof p.text === 'string')).map(p => p.text || '').join('')
        const toolUses = c.filter(p => p && p.type === 'tool_use')
        return { text, toolUses }
    }
    return { text: '', toolUses: [] }
}

function adapt(result) {
    const c = result?.choices?.[0]?.message || {}
    const flat = flattenContent(c.content)
    const openaiTC = Array.isArray(c.tool_calls) ? c.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryJson(tc.function?.arguments) })) : []
    const anthropicTC = flat.toolUses.map(t => ({ id: t.id, name: t.name, arguments: t.input || {} }))
    const tool_calls = openaiTC.concat(anthropicTC)
    // Weak models may emit tool calls as text (kimi <|tool_call_begin|> / llama
    // <|python_tag|>) instead of structured tool_calls. Recover them so the loop
    // iterates; clear the text content since it was the call, not a reply.
    if (!tool_calls.length) {
        const textTC = parseTextToolCalls(flat.text)
        if (textTC.length) return { content: '', tool_calls: textTC, raw: result }
    }
    return { content: flat.text, tool_calls, raw: result }
}

// Names callers can use as model= to select a curated acptoapi chain.
// Mirror lib/named-chains.js BUILTIN — acptoapi resolves unknown names.
const NAMED_CHAIN_NAMES = new Set(['fast', 'cheap', 'smart', 'reasoning', 'free', 'local', 'auto'])

async function buildModel({ provider, model, inputModel }) {
    if (provider) return `${provider}/${model || DEFAULTS[provider] || ''}`.replace(/\/$/, '')
    if (model) return model
    if (inputModel) {
        // Bare name with no slash/comma and matching a known chain → pass through
        // so acptoapi's named-chain resolver picks the curated list.
        if (typeof inputModel === 'string' && !inputModel.includes('/') && !inputModel.includes(',') && NAMED_CHAIN_NAMES.has(inputModel)) {
            return inputModel
        }
        return inputModel
    }

    // Build intelligence-ranked auto-chain from ALL available providers (env
    // keys + extra-providers.txt + ACP daemons). buildAutoChain already handles
    // hasProvider filtering (env keys + sampler) and SWE-bench score ordering.
    let chain = []
    try { chain = typeof sdk.buildAutoChain === 'function' ? sdk.buildAutoChain(undefined, { hasTools: true }) : [] } catch {}

    const pref = getConfigValue('agent.model_preference', [])
    const prefModels = Array.isArray(pref) && pref.length
        ? pref.map(p => `${p.provider}/${p.model || DEFAULTS[p.provider] || ''}`.replace(/\/$/, '')).filter(s => s.includes('/'))
        : []

    if (prefModels.length && chain.length) {
        // model_preference is an ORDERED user failover list (AGENTS.md "ordered
        // failover, sampler-gated"): the user's declared order leads, the
        // intelligence-ranked auto-chain is the fallback tail. Previously this
        // score-merged — but the swe-bench score cache is inert on machines
        // without a populated scores file, which silently demoted the user's
        // declared order below whatever availability ranked first (witnessed:
        // mistral/voxtral-small leading over the declared kimi-k3).
        const status = typeof sdk.getStatus === 'function' ? sdk.getStatus() : []
        const blocked = new Set(status.filter(s => s.ok === false).map(s => s.provider))
        const seen = new Set()
        const ordered = []
        for (const m of [...prefModels, ...chain.map(l => l.model)]) {
            if (seen.has(m)) continue
            seen.add(m)
            if (blocked.has(m.split('/')[0])) continue
            ordered.push(m)
        }
        if (ordered.length) return ordered.join(', ')
    }

    // No model_preference: filter by env-key presence and sampler state.
    const keyed = Array.isArray(chain) ? chain.filter(l => { const p = l.model.split('/')[0]; const env = PROVIDER_KEYS[p]; return env && process.env[env] }) : []
    const status = typeof sdk.getStatus === 'function' ? sdk.getStatus() : []
    if (status.length && keyed.length) {
        const blocked = new Set(status.filter(s => s.ok === false).map(s => s.provider))
        const filtered = keyed.filter(l => !blocked.has(l.model.split('/')[0]))
        if (filtered.length) return filtered.map(l => l.model).join(', ')
    }
    if (keyed.length) return keyed.map(l => l.model).join(', ')
    // No local provider keys — delegate to acptoapi if reachable.
    if (await cachedReachable()) return env('FREDDIE_LLM_MODEL') || 'auto'
    return null
}

export function resolveCallLLM({ provider, model } = {}) {
    // Fire async extra-provider probe on first call (non-blocking). The sync
    // loadFromCache inside buildAutoChain picks up the previous run's probe
    // cache immediately; this async refresh updates the cache for future turns.
    warmExtraProviders()
    return async (input) => {
        const m = await buildModel({ provider, model, inputModel: input.model })
        if (!m) {
            const status = typeof sdk.getStatus === 'function' ? sdk.getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ') : ''
            throw new Error('no LLM backend reachable: set a provider API key or FREDDIE_LLM_MODEL' + (status ? ' | sampler: ' + status : ''))
        }
        try {
            const isSimple = typeof m === 'string' && !m.includes(',') && !/^queue\//.test(m)

            if (isSimple && await cachedReachable()) {
                return await bridgeCall({ ...input, model: m })
            }

            // fallbackOn list mirrors acptoapi/lib/named-chains.js FALLBACK_ON.
            // Without this, comma-separated model lists default to ['error'] and
            // rate-limited / empty / timed-out responses don't trigger chain
            // fallback — the request just throws.
            // max_tokens: acptoapi passes an unset value through to some providers
            // as a very high implicit default (witnessed: 65536), which a
            // low-credit free-tier account (e.g. openrouter) rejects outright with
            // a 402 before even trying the request at a smaller size. 4096 matches
            // acptoapi-bridge.js's own in-process default (see callLLM above).
            const opts = { model: m, messages: toMsgs(input.messages), tools: toTools(input.tools), max_tokens: input.max_tokens || 4096, onFallback: input.onFallback, output: 'openai', fallbackOn: ['error', 'rate_limit', 'timeout', 'empty'] }
            if (/^queue\//.test(m)) opts.queuesMap = getConfigValue('agent.model_queues', {}) || {}
            if (m.includes(',') || /^queue\//.test(m)) opts.matrixSource = env('FREDDIE_MATRIX_URL') || MATRIX_FILE

            if (typeof sdk.chat !== 'function') {
                // Browser/no-sdk context: fall back to acptoapi-bridge's in-process
                // call (may be a no-op/broken in true browser bundles since acptoapi
                // is externalized for vite -- unverified post-rewrite, see build:browser).
                return await bridgeCall({ ...input, model: m })
            }
            // Streaming path: when the caller wants deltas (GUI workspace / REPL
            // progress), use the chain-aware sdkStream with the same opts and take
            // ONE logical step (text-delta events stream live; tool-call events
            // arrive fully assembled). Stop at the first finish-step: acptoapi's
            // stream runs its own internal multi-step tool loop, but freddie's
            // machine drives its own loop. Any mid-stream failure falls through
            // to the buffered chat() below -- partial deltas already emitted are
            // harmless because the settled message.append carries the
            // authoritative full text.
            if (typeof input.onChunk === 'function' && typeof sdk.sdkStream === 'function') {
                try {
                    let text = ''
                    const tool_calls = []
                    for await (const ev of sdk.sdkStream({ ...opts, output: 'events' })) {
                        if (ev?.type === 'text-delta' && ev.textDelta) { text += ev.textDelta; input.onChunk(ev.textDelta) }
                        else if (ev?.type === 'tool-call') {
                            const args = ev.args ?? ev.input ?? {}
                            tool_calls.push({ id: ev.toolCallId || ('call_' + tool_calls.length), type: 'function', function: { name: ev.toolName, arguments: typeof args === 'string' ? args : JSON.stringify(args) } })
                        }
                        else if (ev?.type === 'finish-step' || ev?.type === 'finish') break
                    }
                    return adapt({ choices: [{ message: { content: text, tool_calls } }], provider: m.split('/')[0], model: m })
                } catch { /* swallow: fall through to buffered chat */ }
            }
            const r = await sdk.chat(opts)
            return adapt(r)
        } catch (e) {
            if (/queue not found or empty/i.test(e.message)) throw e
            if (e.chainHistory || /All chain links failed|chain\(\) requires/i.test(e.message)) throw new Error(`chain exhausted: ${(e.attempted || []).map(a => `${a.model}:${a.reason || 'ok'}`).join('; ') || e.message}`)
            throw e
        }
    }
}
