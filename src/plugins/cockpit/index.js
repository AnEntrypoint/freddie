export const plugin = {
    name: 'cockpit',
    register: (ctx) => {
        if (typeof ctx.attachRoute !== 'function') return
        ctx.attachRoute('/api/cockpit/widgets', (_, res) => res.json([{ id: 'sessions', title: 'Sessions', kind: 'list' }, { id: 'tools', title: 'Tools', kind: 'count' }, { id: 'errors', title: 'Recent errors', kind: 'log' }]))
        ctx.attachRoute('/api/cockpit/health', (_, res) => res.json({ ok: true, ts: Date.now() }))
    },
}
