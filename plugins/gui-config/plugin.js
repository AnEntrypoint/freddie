import { loadConfig, saveConfigValue } from '../../src/config.js'
export default {
    name: 'gui-config', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/config', (_, res) => res.json(loadConfig()))
        gui.route('POST', '/api/config', (req, res) => {
            const { key, value } = req.body || {}
            if (!key) return res.status(400).json({ error: 'key required' })
            try { res.json(saveConfigValue(key, value)) } catch (e) { res.status(400).json({ error: String(e.message || e) }) }
        })
    },
}
