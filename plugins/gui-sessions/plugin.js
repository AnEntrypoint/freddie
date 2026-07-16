import { listSessions, search, getMessages, getSession, deleteSession } from '../../src/sessions.js'
export default {
    name: 'gui-sessions', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/sessions', async (_, res) => res.json(await listSessions()))
        gui.route('GET', '/api/sessions/:id', async (req, res) => {
            const s = await getSession(req.params.id)
            if (!s) return res.status(404).json({ error: 'session not found' })
            res.json(s)
        })
        gui.route('GET', '/api/sessions/:id/messages', async (req, res) => res.json(await getMessages(req.params.id)))
        gui.route('DELETE', '/api/sessions/:id', async (req, res) => res.json(await deleteSession(req.params.id)))
        gui.route('GET', '/api/search', async (req, res) => res.json(await search(String(req.query.q || ''))))
    },
}
