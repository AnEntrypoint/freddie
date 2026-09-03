import { listSessions, search, getMessages, getSession, deleteSession } from '../../../src/sessions.js'
import { getTurn } from '../../../src/agent/live-turns.js'
export default {
    name: 'gui-sessions', surfaces: 'gui',
    register({ gui }) {
        // needsInput badges sessions whose live turn is parked on an approval
        // or a pending ask_user_question gate (Claude agents-view / opencode
        // status precedent) — pure read of the live-turns registry, no state
        // change.
        gui.route('GET', '/api/sessions', async (_, res) => {
            const rows = await listSessions()
            res.json(rows.map(s => { const t = getTurn(s.id); return { ...s, needsInput: !!(t?.pendingApproval || t?.pendingQuestion) } }))
        })
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
