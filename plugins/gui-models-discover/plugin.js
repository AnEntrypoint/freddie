import { discoverAndPersist, listKnownProviders } from '../../src/agent/model-discovery.js'
import { PROVIDER_KEYS, DEFAULTS } from '../../src/agent/llm_resolver.js'
import { getConfigValue, saveConfigValue } from '../../src/config.js'
import { getStatus } from '../../src/agent/model-sampler.js'

export default {
    name: 'gui-models-discover', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/models/providers', (_, res) => res.json({ providers: listKnownProviders(), keys: PROVIDER_KEYS, defaults: DEFAULTS }))
        gui.route('GET', '/api/models/cached', (_, res) => res.json(getConfigValue('agent.discovered_models', {}) || {}))
        gui.route('POST', '/api/models/discover', async (req, res) => {
            try { const provider = req.body?.provider; const result = await discoverAndPersist({ provider }); res.json(result) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
        gui.route('GET', '/api/models/queues', (_, res) => res.json(getConfigValue('agent.model_queues', {}) || {}))
        gui.route('POST', '/api/models/queues', (req, res) => {
            const { name, entries } = req.body || {}
            if (!name || !Array.isArray(entries)) return res.status(400).json({ error: 'name and entries[] required' })
            const queues = getConfigValue('agent.model_queues', {}) || {}
            queues[name] = entries
            saveConfigValue('agent.model_queues', queues)
            res.json({ name, entries })
        })
        gui.route('DELETE', '/api/models/queues/:name', (req, res) => {
            const queues = getConfigValue('agent.model_queues', {}) || {}
            delete queues[req.params.name]
            saveConfigValue('agent.model_queues', queues)
            res.json({ ok: true })
        })
        gui.route('GET', '/api/models/sampler', (_, res) => res.json({ status: getStatus() }))
    },
}
