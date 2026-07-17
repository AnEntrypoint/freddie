import { loadConfig, saveConfigValue, DEFAULT_CONFIG } from '../../../src/config.js'
import { listBuiltinSkins } from '../../../src/skin/engine.js'
export default {
    name: 'gui-config', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/config', (_, res) => res.json(loadConfig()))
        gui.route('GET', '/api/config/defaults', (_, res) => res.json(DEFAULT_CONFIG))
        gui.route('GET', '/api/skins', (_, res) => res.json(listBuiltinSkins()))
        gui.route('POST', '/api/config', (req, res) => {
            const { key, value } = req.body || {}
            if (!key) return res.status(400).json({ error: 'key required' })
            try { res.json(saveConfigValue(key, value)) } catch (e) { res.status(400).json({ error: String(e.message || e) }) }
        })
    },
}
