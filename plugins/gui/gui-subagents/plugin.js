import { listSubagents, loadSubagent } from '../../core/delegate/store.js'

export default {
    name: 'gui-subagents', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/subagents', async (_, res) => {
            const rows = await listSubagents()
            res.json(rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')))
        })
        gui.route('GET', '/api/subagents/:id', async (req, res) => {
            const s = await loadSubagent(req.params.id)
            if (!s) return res.status(404).json({ error: 'subagent not found' })
            res.json(s)
        })
    },
}
