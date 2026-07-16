export function buildChatPayload({ model = 'hunyuan-pro', messages, stream = false, tools = [] }) {
    return { model, messages, stream, ...(tools.length ? { tools: tools.map(t => ({ type: 'function', function: t })) } : {}) }
}
export function parseChatResponse(json) {
    const choice = json?.choices?.[0]
    if (!choice) return { content: '', tool_calls: [] }
    const tc = (choice.message?.tool_calls || []).map(c => ({ id: c.id, name: c.function?.name, arguments: c.function?.arguments ? JSON.parse(c.function.arguments) : {} }))
    return { content: choice.message?.content || '', tool_calls: tc }
}
