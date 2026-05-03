import { logger } from '../observability/log.js'

const log = logger('acptoapi')

export function getAcptoapiUrl() {
    return process.env.FREDDIE_LLM_URL || 'http://127.0.0.1:4800/v1'
}

export function getAcptoapiModel() {
    return process.env.FREDDIE_LLM_MODEL || 'claude/haiku'
}

export async function callLLM({ messages, tools = [], model } = {}) {
    const base = getAcptoapiUrl()
    const useModel = model || getAcptoapiModel()
    const body = {
        model: useModel,
        messages: messages.map(adaptMessage),
        stream: false,
        max_tokens: 1024,
    }
    if (Array.isArray(tools) && tools.length) body.tools = tools.map(adaptTool)
    const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer none' },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`acptoapi ${res.status}: ${text.slice(0, 400)}`)
    }
    const json = await res.json()
    log.info('completed', { model: useModel, usage: json.usage })
    return adaptResponse(json)
}

function adaptMessage(m) {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        return {
            role: 'assistant',
            content: m.content || '',
            tool_calls: m.tool_calls.map(tc => ({
                id: tc.id || tc.tool_call_id,
                type: 'function',
                function: { name: tc.name || tc.function?.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || tc.function?.arguments || {}) },
            })),
        }
    }
    return { role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
}

function adaptTool(t) {
    return {
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters || t.input_schema || { type: 'object', properties: {} },
        },
    }
}

function adaptResponse(r) {
    const choice = r.choices?.[0]?.message || {}
    const content = typeof choice.content === 'string' ? choice.content : ''
    const tool_calls = Array.isArray(choice.tool_calls)
        ? choice.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryParseJson(tc.function?.arguments) }))
        : []
    return { content, tool_calls, raw: r }
}

function tryParseJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

export async function isReachable() {
    try {
        const res = await fetch(getAcptoapiUrl().replace(/\/$/, '') + '/models', { headers: { authorization: 'Bearer none' } })
        if (!res.ok) return false
        const json = await res.json()
        return Array.isArray(json.data) && json.data.length > 0
    } catch { return false }
}
