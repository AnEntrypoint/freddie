import { logger } from '../observability/log.js'
import { parseTextToolCalls } from './tool_call_text.js'

const log = logger('acptoapi')

// acptoapi may take minutes to answer when it serially walks dead providers
// (each ~90s timeout) before a live one responds. Node's default undici
// headersTimeout/bodyTimeout (~300s) would throw UND_ERR_HEADERS_TIMEOUT
// mid-walk, so we raise them to 0 (disabled) on the global dispatcher and let
// our AbortController be the single source of truth for the overall deadline
// (default 240s, override via FREDDIE_LLM_TIMEOUT_MS). Use setGlobalDispatcher
// once rather than a per-request Agent so we don't leak a dispatcher per call.
// Browser-safe env read: this module evaluates in a plain browser context where
// `process` is undefined (no node shim yet), so a bare process.env throws
// "process is not defined" and aborts the whole bundle import. envVal() reads
// live (picks up a late-installed shim) and never throws.
const envVal = (k) => { try { return (typeof process !== 'undefined' && process.env) ? process.env[k] : undefined } catch { return undefined } }
const ACPTOAPI_TIMEOUT_MS = Number(envVal('FREDDIE_LLM_TIMEOUT_MS')) || 240000
let _dispatcherSet = false
async function ensureLongTimeoutDispatcher() {
    if (_dispatcherSet) return
    _dispatcherSet = true
    try {
        const undici = await import('undici')
        // headersTimeout/bodyTimeout 0: tolerate acptoapi's minutes-long walk.
        // keepAlive*Timeout 1ms: close the socket right after the response so no
        // keep-alive socket lingers between calls.
        undici.setGlobalDispatcher(new undici.Agent({
            headersTimeout: 0,
            bodyTimeout: 0,
            keepAliveTimeout: 1,
            keepAliveMaxTimeout: 1,
        }))
    } catch { /* undici not available — rely on AbortController + defaults */ }
}

export function getAcptoapiUrl() {
    return envVal('FREDDIE_LLM_URL') || 'http://127.0.0.1:4800/v1'
}

export function getAcptoapiModel() {
    return envVal('FREDDIE_LLM_MODEL') || 'claude/haiku'
}

export async function callLLM({ messages, tools = [], model, tool_choice, cwd = null } = {}) {
    const base = getAcptoapiUrl()
    const useModel = model || getAcptoapiModel()
    const hasTools = Array.isArray(tools) && tools.length > 0
    const adaptedMessages = messages.map(adaptMessage)
    // The coder-agent working-directory note is OPT-IN via an explicit `cwd` param.
    // It used to be injected on every tool-bearing call, which polluted NON-coder
    // agents' prompts with "use your built-in tools (Bash, Read, Write)" -- tool
    // hallucination bait plus a filesystem-path leak for hosts (like a contact-facing
    // chat agent) whose toolset has no such tools. runTurn already composes its own
    // cwd note when a caller passes cwd; direct callLLM users opt in the same way.
    if (hasTools && cwd) {
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
    // Forward a forced tool_choice (e.g. 'required') so a caller can compel a tool
    // call on a turn. Only when tools are present; absent -> the model chooses.
    if (hasTools && tool_choice) body.tool_choice = tool_choice
    const headers = { 'content-type': 'application/json', authorization: 'Bearer none' }
    if (hasTools && cwd) headers['x-cwd'] = cwd
    // Rely on AbortController timeout. acptoapi v1+ ships CORS + Private
    // Network Access headers so cross-origin loopback (gh-pages → localhost)
    // succeeds when acptoapi is running. The earlier preemptive loopback
    // refusal caused false negatives on reachable endpoints.
    await ensureLongTimeoutDispatcher()
    const _ac = new AbortController()
    const _tid = setTimeout(() => _ac.abort(new Error('acptoapi fetch timeout')), ACPTOAPI_TIMEOUT_MS)
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
    let json
    try {
        json = await res.json()
    } catch (e) {
        throw new Error(`acptoapi ${res.status}: invalid JSON response: ${String(e)}`)
    }
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
    // Recover text-format tool calls (kimi <|tool_call_begin|> / llama
    // <|python_tag|>) from weak models that don't emit structured tool_calls.
    if (!tool_calls.length) {
        const textTC = parseTextToolCalls(content)
        if (textTC.length) return { content: '', tool_calls: textTC, raw: r }
    }
    return { content, tool_calls, raw: r }
}

function tryParseJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

export async function isReachable(timeoutMs = 10000) {
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
