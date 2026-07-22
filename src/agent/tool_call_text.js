function randId() {
    return 'call_' + Math.random().toString(36).slice(2, 10)
}

function parseKimiSection(content) {
    if (!content.includes('<|tool_call_begin|>')) return []
    const re = /<\|tool_call_begin\|>\s*([\s\S]*?)\s*<\|tool_call_argument_begin\|>\s*([\s\S]*?)\s*<\|tool_call_end\|>/g
    const out = []
    let m
    while ((m = re.exec(content)) !== null) {
        const name = (m[1] || '').replace(/^functions\./, '').replace(/:\d+\s*$/, '').trim()
        let args
        try { args = JSON.parse((m[2] || '').trim()) } catch { args = {} }
        if (name) out.push({ id: randId(), name, arguments: args })
    }
    return out
}

function parsePythonTag(content) {
    if (!content.includes('<|python_tag|>')) return []
    const after = content.slice(content.indexOf('<|python_tag|>') + '<|python_tag|>'.length).trim().split('\n')[0]
    const mc = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\(([\s\S]*?)\)\s*$/.exec(after)
    if (!mc) return []
    const name = mc[1].split('.')[0]
    const inner = mc[2].trim()
    let args = {}
    if (/^\{[\s\S]*\}$/.test(inner)) { try { args = JSON.parse(inner) } catch { args = {} } }
    else if (/^"[\s\S]*"$/.test(inner)) { const s = inner.slice(1, -1); args = { query: s, input: s } }
    else if (/=/.test(inner)) {
        const kwRe = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[\d.]+|true|false|null)/g
        let mm
        while ((mm = kwRe.exec(inner)) !== null) {
            let v = mm[2]
            if (/^["']/.test(v)) v = v.slice(1, -1)
            else if (/^[\d.]+$/.test(v)) v = Number(v)
            else if (v === 'true') v = true
            else if (v === 'false') v = false
            else if (v === 'null') v = null
            args[mm[1]] = v
        }
    } else if (inner) args = { query: inner, input: inner }
    return name ? [{ id: randId(), name, arguments: args }] : []
}

function parseBareJsonArray(content) {
    const trimmed = content.trim()
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return []
    let parsed
    try { parsed = JSON.parse(trimmed) } catch { return [] }
    if (!Array.isArray(parsed) || !parsed.length) return []
    const out = []
    for (const item of parsed) {
        if (!item || typeof item !== 'object') return []
        const name = item.name
        if (typeof name !== 'string' || !name) return []
        const args = item.parameters ?? item.arguments ?? {}
        if (typeof args !== 'object' || args === null) return []
        out.push({ id: randId(), name, arguments: args })
    }
    return out
}

function findBalancedJsonObjectEnd(text, startIndex) {
    let depth = 0, inString = false, escaped = false
    for (let i = startIndex; i < text.length; i++) {
        const ch = text[i]
        if (inString) {
            if (escaped) escaped = false
            else if (ch === '\\') escaped = true
            else if (ch === '"') inString = false
            continue
        }
        if (ch === '"') { inString = true; continue }
        if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) return i }
    }
    return -1
}

function parseNameFollowedByJsonObject(content) {
    const trimmed = content.trim()
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\{/.exec(trimmed)
    if (!match) return []
    const name = match[1]
    const jsonStart = name.length
    const jsonEnd = findBalancedJsonObjectEnd(trimmed, jsonStart)
    if (jsonEnd === -1) return []
    let args
    try { args = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) } catch { return [] }
    if (typeof args !== 'object' || args === null) return []
    return [{ id: randId(), name, arguments: args }]
}

export function parseTextToolCalls(content) {
    if (typeof content !== 'string' || !content) return []
    const kimi = parseKimiSection(content)
    if (kimi.length) return kimi
    const pythonTag = parsePythonTag(content)
    if (pythonTag.length) return pythonTag
    const bareArray = parseBareJsonArray(content)
    if (bareArray.length) return bareArray
    return parseNameFollowedByJsonObject(content)
}
