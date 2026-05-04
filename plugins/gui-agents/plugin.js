import { bootHost } from '../../src/host/index.js'

export default {
    name: 'gui-agents', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/agents', async (req, res) => {
            try {
                const host = await bootHost()
                const sessions = await (await import('../../src/sessions.js')).listSessions()
                const activeSessions = sessions.filter(s => {
                    const updated = new Date(s.updated_at || 0)
                    const now = new Date()
                    return (now - updated) < 300000
                })
                res.json({
                    count: activeSessions.length,
                    active: activeSessions.length > 0 ? activeSessions[0].id : null,
                    turns: sessions.reduce((acc, s) => acc + (s.turn_count || 0), 0),
                    last_activity: activeSessions.length > 0 ? activeSessions[0].updated_at : null,
                })
            } catch (e) {
                res.status(500).json({ error: String(e.message || e) })
            }
        })
    },
}
