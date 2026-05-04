import { logger } from '../observability/log.js'

const log = logger('pi-bridge')

let _piAi = null
async function pi() {
    if (_piAi) return _piAi
    _piAi = await import('@mariozechner/pi-ai')
    _piAi.registerBuiltInApiProviders()
    return _piAi
}

export async function callLLM({ messages, tools = [], model, provider = 'anthropic' } = {}) {
    const m = await pi()
    const modelObj = m.getModel ? m.getModel(provider, model) : { provider, id: model }
    if (!modelObj) throw new Error(`pi-bridge: unknown model ${model} for provider ${provider}`)
    const apiKey = m.getEnvApiKey ? m.getEnvApiKey(provider) : process.env[providerEnv(provider)]
    if (!apiKey) throw new Error(`pi-bridge: no API key for ${provider} (set ${providerEnv(provider)})`)
    const result = await m.complete(modelObj, { messages: messages.map(adaptMessage), tools: tools.map(adaptTool) }, { apiKey })
    log.info('completed', { model: model || 'default', usage: result.usage })
    return adaptResponse(result)
}

function providerEnv(p) { return ({ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY' })[p] || `${String(p).toUpperCase()}_API_KEY` }

function adaptMessage(m) {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
    return { role: m.role, content: m.content || '', tool_calls: m.tool_calls }
}

function adaptTool(t) {
    return { name: t.name, description: t.description, input_schema: t.parameters || t.input_schema || { type: 'object', properties: {} } }
}

function adaptResponse(r) {
    const content = typeof r.content === 'string' ? r.content : (Array.isArray(r.content) ? r.content.filter(c => c.type === 'text').map(c => c.text).join('') : '')
    const tool_calls = (Array.isArray(r.content) ? r.content.filter(c => c.type === 'tool_use').map(c => ({ id: c.id, name: c.name, arguments: c.input })) : (r.tool_calls || []))
    return { content, tool_calls, raw: r }
}
