import { createRequire } from 'module'
import { callLLM as acptoapiCall, isReachable as acptoapiReachable } from './acptoapi-bridge.js'
import { isAvailable, markFailed, getStatus } from './model-sampler.js'
import { getConfigValue } from '../config.js'
import { resolveKey } from './credential_sources.js'

const _require = createRequire(import.meta.url)
const sdk = _require('acptoapi')
const { streamClaude, CLAUDE_DEFAULT } = _require('acptoapi/lib/claude-client')

export const PROVIDER_KEYS = sdk.PROVIDER_KEYS
export const DEFAULTS = sdk.PROVIDER_DEFAULTS

const ACP_BACKENDS = {
    kilo: { base: 'http://localhost:4780', providerID: 'kilo', defaultModel: 'openrouter/free' },
    opencode: { base: 'http://localhost:4790', providerID: 'opencode', defaultModel: 'minimax-m2.5-free' },
}

async function claudeCliChat(model, input) {
    const userMsg = input.messages.filter(m => m.role === 'user').slice(-1)[0]?.content
    const systemMsg = input.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') || undefined
    const prompt = typeof userMsg === 'string' ? userMsg : JSON.stringify(userMsg || '')
    let content = ''; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 120000)
    try {
        for await (const ev of streamClaude({ prompt, model: model || CLAUDE_DEFAULT, systemPrompt: systemMsg, signal: ctrl.signal })) {
            if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) for (const part of ev.message.content) { if (part.type === 'text' && part.text) content += part.text }
            if (ev.type === 'result' && typeof ev.result === 'string') content = ev.result
        }
    } finally { clearTimeout(t) }
    return { content: content.trim(), tool_calls: [], raw: { provider: 'claude-cli', model } }
}

async function acpChat(prefix, model, input) {
    const b = ACP_BACKENDS[prefix]; if (!b) throw new Error(`unknown acp backend: ${prefix}`)
    const sessRes = await fetch(`${b.base}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) })
    if (!sessRes.ok) throw new Error(`ACP ${prefix} /session ${sessRes.status}`)
    const sessionId = (await sessRes.json()).id
    const userMsg = input.messages.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
    const body = { parts: [{ type: 'text', text: String(userMsg) }], model: { providerID: b.providerID, modelID: model || b.defaultModel } }
    const evRes = await fetch(`${b.base}/event`, { method: 'GET', signal: AbortSignal.timeout(120000) })
    if (!evRes.ok) throw new Error(`ACP ${prefix} /event ${evRes.status}`)
    const msgRes = await fetch(`${b.base}/session/${sessionId}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) })
    if (!msgRes.ok) throw new Error(`ACP ${prefix} /message ${msgRes.status}: ${(await msgRes.text()).slice(0,200)}`)
    let content = ''; let sawAssistantText = false
    const reader = evRes.body.getReader(); const dec = new TextDecoder(); let buf = ''
    while (true) {
        const { value, done } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true }); let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
            const raw = buf.slice(0, idx); buf = buf.slice(idx + 2)
            if (!raw.startsWith('data: ')) continue
            try { const ev = JSON.parse(raw.slice(6))
                if (ev.properties?.sessionID && ev.properties.sessionID !== sessionId) continue
                if (ev.type === 'message.part.updated' && ev.properties?.part?.type === 'text' && ev.properties.part.text) { content = ev.properties.part.text; sawAssistantText = true }
                if (ev.type === 'session.error') throw new Error(`ACP ${prefix} session.error: ${JSON.stringify(ev.properties?.error || {}).slice(0,200)}`)
                if (ev.type === 'session.idle') return { content: content.trim(), tool_calls: [], raw: { provider: prefix, model } }
            } catch (e) { if (/session.error/.test(e.message)) throw e }
        }
    }
    return { content: content.trim(), tool_calls: [], raw: { provider: prefix, model } }
}

function toOpenAITools(schemas) {
    if (!schemas?.length) return undefined
    return schemas.map(s => ({ type: 'function', function: { name: s.name, description: s.description || '', parameters: s.parameters || { type: 'object', properties: {} } } }))
}

function toOpenAIMessages(messages) {
    return messages.map(m => {
        if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
            return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name || tc.function?.name, arguments: typeof (tc.arguments || tc.function?.arguments) === 'string' ? (tc.arguments || tc.function?.arguments) : JSON.stringify(tc.arguments || tc.function?.arguments || {}) } })) }
        }
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
        return m
    })
}

async function directOpenAICompatChat(url, apiKey, model, messages, tools) {
    const body = { model, messages: toOpenAIMessages(messages), ...(tools?.length ? { tools } : {}) }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(`${res.status} ${t.slice(0, 200)}`) }
    return res.json()
}

async function sdkChat(provider, model, input) {
    if (provider === 'claude-cli') return await claudeCliChat(model, input)
    if (provider === 'kilo' || provider === 'opencode') return await acpChat(provider, model, input)
    const { resolveModel } = sdk
    const r = resolveModel(`${provider}/${model}`)
    const resolved = await resolveKey(provider).catch(() => ({ value: null }))
    const apiKey = resolved.value || (r.env ? process.env[r.env] : undefined)
    const openaiTools = toOpenAITools(input.tools)
    let result
    if (r.provider === 'openai-compat') {
        result = await directOpenAICompatChat(r.url, apiKey, r.model, input.messages, openaiTools)
    } else {
        const { buffer: sdkBuffer } = sdk
        result = await sdkBuffer({ from: null, to: 'openai', provider: r.provider, model: r.model, messages: toOpenAIMessages(input.messages), apiKey, ...(openaiTools ? { tools: openaiTools } : {}) })
    }
    const choice = result?.choices?.[0]?.message || {}
    const content = typeof choice.content === 'string' ? choice.content : ''
    const tool_calls = Array.isArray(choice.tool_calls)
        ? choice.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryParseJson(tc.function?.arguments) }))
        : []
    return { content, tool_calls, raw: result }
}

function tryParseJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

async function hasKey(provider) {
    if (provider === 'claude-cli' || provider === 'kilo' || provider === 'opencode') return true
    const resolved = await resolveKey(provider).catch(() => ({ value: null }))
    if (!resolved.value) return false
    if (provider === 'cloudflare' && !process.env.CLOUDFLARE_ACCOUNT_ID) return false
    return true
}

function defaultModel(provider) {
    return DEFAULTS[provider] || ''
}

async function tryChain(entries, input, model) {
    const errors = []
    for (const pref of entries) {
        const p = pref.provider; const m = pref.model || model || input.model || (DEFAULTS[p] || '')
        if (!await hasKey(p) || !isAvailable(p)) continue
        try { return await sdkChat(p, m, input) } catch (e) { markFailed(p); errors.push(`${p}: ${e.message}`) }
    }
    if (errors.length) throw new Error(`chain exhausted: ${errors.join('; ')}`)
    throw new Error('chain empty: no available providers')
}

export function resolveCallLLM({ provider, model } = {}) {
    return async (input) => {
        const mdl = model || input.model
        const queueMatch = typeof mdl === 'string' && /^queue\//.test(mdl)
        if (queueMatch) {
            const name = mdl.slice('queue/'.length)
            const queues = getConfigValue('agent.model_queues', {}) || {}
            const entries = Array.isArray(queues[name]) ? queues[name] : null
            if (!entries || entries.length === 0) throw new Error(`queue not found or empty: ${name}`)
            return await tryChain(entries, input, undefined)
        }
        const explicitProvider = provider || input.provider

        if (explicitProvider && await hasKey(explicitProvider)) {
            const m = model || input.model || defaultModel(explicitProvider)
            if (!isAvailable(explicitProvider)) {
                const status = getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ')
                throw new Error(`provider ${explicitProvider} is in backoff | sampler: ${status}`)
            }
            try {
                return await sdkChat(explicitProvider, m, input)
            } catch (e) {
                markFailed(explicitProvider)
                throw e
            }
        }

        if (await acptoapiReachable()) {
            return await acptoapiCall({ ...input, model: model || input.model })
        }

        const preference = getConfigValue('agent.model_preference', [])
        if (Array.isArray(preference) && preference.length > 0) {
            try { return await tryChain(preference, input, model) } catch (e) { if (!/chain empty/.test(e.message)) throw e }
        }

        const links = sdk.buildAutoChain(model || input.model)
        const availableLinks = (await Promise.all(links.map(async l => {
            const prefix = l.model.split('/')[0]
            return (await hasKey(prefix)) && isAvailable(prefix) ? l : null
        }))).filter(Boolean)

        for (const link of availableLinks) {
            const prefix = link.model.split('/')[0]
            const m = link.model.replace(/^[^/]+\//, '')
            try {
                return await sdkChat(prefix, m, input)
            } catch (e) {
                markFailed(prefix)
            }
        }

        const status = getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ')
        throw new Error('no LLM backend reachable: set a provider API key or start acptoapi (http://127.0.0.1:4800/v1)' + (status ? ' | sampler: ' + status : ''))
    }
}
