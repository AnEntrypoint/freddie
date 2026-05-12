import { resolveCallLLM } from '../../src/agent/llm_resolver.js'
import { logger } from '../../src/observability/log.js'

const log = logger('gui-llm-passthrough')

export default {
    name: 'gui-llm-passthrough', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/v1/models', (_, res) => {
            res.json({ object: 'list', data: [{ id: 'freddie/auto', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'freddie' }] })
        })
        gui.route('POST', '/v1/chat/completions', async (req, res) => {
            const { model, messages, tools, stream } = req.body || {}
            if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: { message: 'messages required' } })
            try {
                let provider, mdl
                if (typeof model === 'string' && model.includes('/')) {
                    const idx = model.indexOf('/'); provider = model.slice(0, idx); mdl = model.slice(idx + 1)
                }
                const call = resolveCallLLM({ provider, model: mdl })
                const out = await call({ messages, tools: tools?.map(t => ({ name: t.function?.name, description: t.function?.description, parameters: t.function?.parameters })) || [], model: mdl })
                const id = 'chatcmpl-' + Math.random().toString(36).slice(2, 12)
                const created = Math.floor(Date.now() / 1000)
                const choice = { index: 0, message: { role: 'assistant', content: out.content || '', ...(out.tool_calls?.length ? { tool_calls: out.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) } })) } : {}) }, finish_reason: 'stop' }
                if (stream) {
                    res.setHeader('content-type', 'text/event-stream')
                    res.setHeader('cache-control', 'no-cache')
                    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'freddie/auto', choices: [{ index: 0, delta: { role: 'assistant', content: out.content || '' }, finish_reason: null }] })}\n\n`)
                    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'freddie/auto', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
                    res.write('data: [DONE]\n\n')
                    res.end()
                    return
                }
                res.json({ id, object: 'chat.completion', created, model: model || 'freddie/auto', choices: [choice], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })
            } catch (e) {
                log.error('chat-completions-failed', { error: String(e.message || e) })
                res.status(500).json({ error: { message: String(e.message || e), type: 'upstream_error' } })
            }
        })
    },
}
