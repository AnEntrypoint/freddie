export default {
    name: 'gui-gateway', surfaces: 'gui',
    register({ gui, host }) {
        gui.route('GET', '/api/gateway', (_, res) => {
            const platforms = host.pi.platforms.list().map(p => p.name)
            res.json({ platforms: platforms.map(p => ({ name: p, enabled: false, note: 'start with freddie gateway --port <port>' })) })
        })
    },
}
