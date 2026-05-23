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
    const hasTools = Array.isArray(tools) && tools.length > 0
    const adaptedMessages = messages.map(adaptMessage)
    if (hasTools) {
        const cwd = process.cwd()
        const sysIdx = adaptedMessages.findIndex(m => m.role === 'system')
        const cwdNote = `\nWorking directory: ${cwd}\nUse your built-in tools (Bash, Read, Write) to explore files in this directory when needed.`
        if (sysIdx >= 0) adaptedMessages[sysIdx] = { ...adaptedMessages[sysIdx], content: (adaptedMessages[sysIdx].content || '') + cwdNote }
        else adaptedMessages.unshift({ role: 'system', content: cwdNote.trim() })
    }
    const body = {
        model: useModel,
        messages: adaptedMessages,
        stream: false,
        max_tokens: 4096,
    }
    if (hasTools) body.tools = tools.map(adaptTool)
    const headers = { 'content-type': 'application/json', authorization: 'Bearer none' }
    const cwd = process.cwd()
    if (Array.isArray(tools) && tools.length) headers['x-cwd'] = cwd
    // Rely on AbortController timeout. acptoapi v1+ ships CORS + Private
    // Network Access headers so cross-origin loopback (gh-pages → localhost)
    // succeeds when acptoapi is running. The earlier preemptive loopback
    // refusal caused false negatives on reachable endpoints.
    const _ac = new AbortController()
    const _tid = setTimeout(() => _ac.abort(new Error('acptoapi fetch timeout')), 60000)
    let res
    try {
        res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: _ac.signal,
        })
    } finally { clearTimeout(_tid) }
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

export async function isReachable(timeoutMs = 2000) {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const res = await fetch(getAcptoapiUrl().replace(/\/$/, '') + '/models', {
                headers: { authorization: 'Bearer none' },
                signal: controller.signal
            })
            clearTimeout(timeoutId)
            if (!res.ok) return false
            const json = await res.json()
            return Array.isArray(json.data) && json.data.length > 0
        } finally {
            clearTimeout(timeoutId)
        }
    } catch { return false }
}
