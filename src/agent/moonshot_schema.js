export function adaptToolSchema(tool) {
    const s = { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema || tool.parameters || { type: 'object', properties: {} } } }
    if (s.function.parameters.required && !s.function.parameters.required.length) delete s.function.parameters.required
    return s
}
export function adaptMessages(messages) {
    return messages.map(m => {
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
        return m
    })
}
