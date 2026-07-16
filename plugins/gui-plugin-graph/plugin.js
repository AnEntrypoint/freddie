// Plugin dependency graph: D3-compatible {nodes,edges} derived from each
// plugin's declared `requires` array (already used for cycle detection at
// load time) plus what it actually registered, via host.capabilities().
import { registerDebug } from '../../src/observability/debug.js'

function graphFrom(host) {
    const plugins = host.plugins()
    const nodes = plugins.map(p => ({
        id: p.name,
        surfaces: p.surfaces,
        capabilities: host.capabilities(p.name) || { tools: [], hooks: [], commands: [], crons: [], routes: [] },
    }))
    const edges = plugins.flatMap(p => (p.requires || []).map(dep => ({ from: p.name, to: dep })))
    return { nodes, edges }
}

registerDebug('plugin-graph', () => ({ note: 'GET /api/plugin-graph for the full D3-compatible dependency tree' }))

export default {
    name: 'gui-plugin-graph', surfaces: 'gui',
    register({ gui, host }) {
        gui.route('GET', '/api/plugin-graph', (_req, res) => res.json(graphFrom(host)))
    },
}
