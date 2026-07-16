function clean(o) {
    if (Array.isArray(o)) return o.map(clean)
    if (!o || typeof o !== 'object') return o
    const out = {}
    for (const [k, v] of Object.entries(o)) {
        if (k === '$schema' || k === 'additionalProperties' || k === '$ref' || k === 'oneOf' || k === 'anyOf') continue
        out[k] = clean(v)
    }
    return out
}
export function adaptToolForGemini(tool) {
    return { name: tool.name, description: tool.description || '', parameters: clean(tool.input_schema || tool.parameters || { type: 'object', properties: {} }) }
}
export function adaptMessagesForGemini(messages) {
    return messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: typeof m.content === 'string' ? [{ text: m.content }] : (Array.isArray(m.content) ? m.content.map(p => p.text ? { text: p.text } : p) : [{ text: JSON.stringify(m.content) }]),
    }))
}
