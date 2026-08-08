import { parseTextToolCalls } from './tool_call_text.js'

export function forcedToolChoiceMissed(tool_choice, hasTools, adapted) {
    const forced = tool_choice === 'required' || tool_choice?.type === 'required'
    return forced && hasTools && !adapted.tool_calls.length
}

// Mirrors casey's own hooks/heuristics.js isToolRefusal so the SAME class of
// content ("I don't have the tools/access to assist") is recognized at this
// layer too, for the availability-penalty decision -- kept independent
// (freddie must not import casey's app-specific heuristics module) but
// intentionally the same marker shape.
const TOOL_REFUSAL_MARKERS = [
    "don't have the tools",
    'do not have the tools',
    "don't have access to",
    'do not have access to',
    'unable to access the',
    'i cannot call',
    "i can't call",
    'no tool available',
    'lack the necessary tools',
]
export function isLikelyToolRefusal(text) {
    if (!text) return false
    const norm = String(text).toLowerCase().replace(/\s+/g, ' ').trim()
    return TOOL_REFUSAL_MARKERS.some(m => norm.includes(m))
}

export function adaptMessage(m) {
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

export function adaptTool(t) {
    return {
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters || t.input_schema || { type: 'object', properties: {} },
        },
    }
}

export function adaptResponse(r) {
    const choice = r?.choices?.[0]?.message || {}
    const content = typeof choice.content === 'string' ? choice.content : ''
    const tool_calls = Array.isArray(choice.tool_calls)
        ? choice.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryParseJson(tc.function?.arguments) }))
        : []
    // Recover text-format tool calls (kimi <|tool_call_begin|> / llama
    // <|python_tag|> / a bare JSON array of {name,parameters}) from weak
    // models that don't emit structured tool_calls -- see tool_call_text.js
    // for the full format list and why a bare-array match is deliberately
    // narrow (whole-content only, never JSON quoted inside real prose).
    if (!tool_calls.length) {
        const textTC = parseTextToolCalls(content)
        if (textTC.length) return { content: '', tool_calls: textTC, raw: r }
    }
    return { content, tool_calls, raw: r }
}

export function tryParseJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }
