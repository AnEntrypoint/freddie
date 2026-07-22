// Some fast/weak models emit tool calls as plain TEXT in their own native token
// format instead of structured OpenAI `tool_calls` (especially when the system
// prompt is rich). The agent loop only acts on structured tool_calls, so without
// recovery it stalls after one turn. parseTextToolCalls() extracts both observed
// formats from a content string and returns OpenAI-shaped {id,name,arguments}[].
//
// Formats handled:
//   - kimi / moonshot section format:
//       <|tool_calls_section_begin|>
//         <|tool_call_begin|> functions.<name>:<idx>
//         <|tool_call_argument_begin|> {json-args}
//         <|tool_call_end|>
//       <|tool_calls_section_end|>
//   - llama python_tag format:
//       <|python_tag|>name({...})  or  name("query")  or  name(key="value")
//   - bare JSON array format (a third real weak-model shape, distinct from
//     both above): `[{"name": "<tool>", "parameters": {...}}]`, the WHOLE
//     content is nothing but this array (no tokens/tags at all, no prose
//     wrapping it). Live-witnessed: nvidia/abacusai/dracarys-llama-3.1-70b-
//     instruct returned this shape verbatim as its message content with
//     tool_choice:'required' -- with no recovery, that raw JSON string was
//     sent to the contact as if it were a real reply (a serious content
//     bug, not just a stalled turn). Deliberately narrow: matched only when
//     the ENTIRE trimmed content parses as this exact array-of-objects
//     shape, so a genuine chat reply that happens to mention or quote JSON
//     inline (e.g. explaining an error message) is never misread as a tool
//     call -- a real reply is prose WITH the JSON inside it, not JSON alone.
//
// Returns [] when the content holds no recognizable text tool call.

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
    // Must be the WHOLE content, not JSON embedded in prose -- a real chat
    // reply that quotes/explains JSON is never mistaken for a tool call.
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

// A FOURTH real weak-model shape, distinct from all three above:
// `functionName{...json args...}` at the very start of content -- no parens
// (unlike python_tag), no enclosing array (unlike the bare-array format), and
// often followed by trailing garbage (a degenerate repetition loop, stray
// prose) rather than being the whole content. Live-witnessed:
// mistral/devstral-latest returned `case_report{"id": "...", "location":
// "..."}  # <hundreds of repeated words>` as raw message content -- a real
// tool name immediately followed by an unparenthesized JSON object, with a
// severe content-safety consequence identical to the bare-array case: sent
// verbatim, this would have reached a real contact as memobot's reply.
// Matched only when NAME{ appears at the very start of the trimmed content
// (name must look like a real identifier, not any word ever followed by a
// brace) -- deliberately narrow so a genuine reply that happens to start
// with a word then a brace in unrelated prose is never misread. The JSON
// object's extent is found by counting balanced braces (respecting string
// literals) rather than a greedy regex, so trailing garbage after the
// legitimate tool-call payload is correctly excluded from the parsed args
// rather than breaking JSON.parse or being silently swallowed into them.
function parseBareNameBraceCall(content) {
    const trimmed = content.trim()
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\{/.exec(trimmed)
    if (!m) return []
    const name = m[1]
    const start = m[1].length
    let depth = 0, inStr = false, esc = false, end = -1
    for (let i = start; i < trimmed.length; i++) {
        const ch = trimmed[i]
        if (inStr) {
            if (esc) esc = false
            else if (ch === '\\') esc = true
            else if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') { inStr = true; continue }
        if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) return []
    let args
    try { args = JSON.parse(trimmed.slice(start, end + 1)) } catch { return [] }
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
    return parseBareNameBraceCall(content)
}
