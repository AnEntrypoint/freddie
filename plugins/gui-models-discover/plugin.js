import { discoverAndPersist, listKnownProviders } from '../../src/agent/model-discovery.js'
import { PROVIDER_KEYS, DEFAULTS } from '../../src/agent/llm_resolver.js'
import { getConfigValue } from '../../src/config.js'

export default {
    name: 'gui-models-discover', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/models/providers', (_, res) => res.json({ providers: listKnownProviders(), keys: PROVIDER_KEYS, defaults: DEFAULTS }))
        gui.route('GET', '/api/models/cached', (_, res) => res.json(getConfigValue('agent.discovered_models', {}) || {}))
        gui.route('POST', '/api/models/discover', async (req, res) => {
            try { const provider = req.body?.provider; const result = await discoverAndPersist({ provider }); res.json(result) }
            catch (e) { res.status(500).json({ error: String(e.message || e) }) }
        })
    },
}
