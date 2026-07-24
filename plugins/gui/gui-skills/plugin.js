import path from 'node:path'
import { listSkills } from '../../../src/skills/index.js'
export default {
    name: 'gui-skills', surfaces: 'gui',
    register({ gui, config }) {
        gui.route('GET', '/api/skills', (_, res) => {
            const skillState = config.get('skillState') || {}
            res.json({ home: listSkills(), bundled: listSkills([path.resolve('skills')]), skillState })
        })
        gui.route('POST', '/api/skills/:name', (req, res) => {
            try {
                const { name } = req.params
                const { enabled } = req.body || {}
                if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' })
                const skillState = config.get('skillState') || {}
                skillState[name] = { ...(skillState[name] || {}), enabled }
                config.set('skillState', skillState)
                res.json({ ok: true, name, skillState: skillState[name] })
            } catch (e) { res.status(400).json({ error: e.message }) }
        })
    },
}
