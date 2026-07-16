export default {
    name: 'cockpit', surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/cockpit/widgets', (_, res) => res.json([{ id: 'sessions', title: 'Sessions', kind: 'list' }, { id: 'tools', title: 'Tools', kind: 'count' }, { id: 'errors', title: 'Recent errors', kind: 'log' }]))
        gui.route('GET', '/api/cockpit/health', (_, res) => res.json({ ok: true, ts: Date.now() }))
    },
}
