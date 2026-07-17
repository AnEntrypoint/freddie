import { createRequire } from 'module'
import { getConfigValue } from '../../../src/config.js'
import { MATRIX_FILE, flattenForOpenAI } from '../../../src/models/discovery.js'
import { logger } from '../../../src/observability/log.js'
import { randomId } from '../../../src/utils.js'
import { env } from '../../../src/env.js'

const _require = createRequire(import.meta.url)
const sdk = _require('acptoapi')
const log = logger('gui-llm-passthrough')

function matrixSource() { return env('FREDDIE_MATRIX_URL') || MATRIX_FILE }

export default {
    name: 'gui-llm-passthrough', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/v1/models', async (_, res) => {
            try {
                const rows = await sdk.listAllModelsAndQueues({ queuesMap: getConfigValue('agent.model_queues', {}) || {}, matrixSource: matrixSource() })
                const local = flattenForOpenAI()
                const seen = new Set(rows.map(r => r.id))
                for (const r of local) if (!seen.has(r.id)) rows.push(r)
                if (rows.length === 0) rows.push({ id: 'freddie/auto', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'freddie' })
                res.json({ object: 'list', data: rows })
            } catch (e) { log.error('list-models-failed', { error: String(e.message || e) }); res.json({ object: 'list', data: flattenForOpenAI() }) }
        })
        gui.route('POST', '/v1/chat/completions', async (req, res) => {
            const { model, messages, tools, stream } = req.body || {}
            if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: { message: 'messages required' } })
            try {
                const out = await sdk.chat({ model: model || 'freddie/auto', messages, tools, queuesMap: getConfigValue('agent.model_queues', {}) || {}, matrixSource: matrixSource(), output: 'openai' })
                if (stream) {
                    const id = 'chatcmpl-' + randomId(6)
                    const created = Math.floor(Date.now() / 1000)
                    const content = out?.choices?.[0]?.message?.content || ''
                    res.setHeader('content-type', 'text/event-stream'); res.setHeader('cache-control', 'no-cache')
                    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'freddie/auto', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`)
                    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'freddie/auto', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
                    res.write('data: [DONE]\n\n'); res.end(); return
                }
                res.json(out)
            } catch (e) { log.error('chat-completions-failed', { error: String(e.message || e) }); res.status(500).json({ error: { message: String(e.message || e), type: 'upstream_error' } }) }
        })
    },
}
