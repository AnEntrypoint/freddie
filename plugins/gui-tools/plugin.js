export default {
    name: 'gui-tools', surfaces: 'gui',
    register({ gui, host }) {
        gui.route('GET', '/api/tools', (_, res) => res.json(host.pi.tools.list().map(t => ({ name: t.name, toolset: t.toolset, schema: t.schema }))))
        gui.route('GET', '/api/tools/detail', (_, res) => res.json(host.pi.tools.list().map(t => ({ name: t.name, toolset: t.toolset, description: t.schema?.description || '' }))))
    },
}
