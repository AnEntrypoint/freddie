// Flat plugin list for the dashboard's Plugins panel (design SDK's
// PluginsConfig component): {name, surfaces, requires, source, enabled}
// per plugin — distinct from gui-plugin-graph's D3 {nodes,edges} shape,
// which is built for the dependency-graph visualization, not a list UI.
import { registerDebug } from '../../src/observability/debug.js'

function listFrom(host) {
    // host.plugins() returns a stripped-down {name,version,surfaces,requires}
    // view; the real loaded plugin object (with __sourceFile) lives behind
    // host.get(name) — pull the source path from there.
    return host.plugins().map(p => ({
        name: p.name,
        version: p.version,
        surfaces: p.surfaces,
        requires: p.requires || [],
        source: (host.get(p.name) || {}).__sourceFile || null,
        enabled: true, // freddie has no per-plugin runtime disable today; always true once loaded
    }))
}

registerDebug('plugins-list', () => ({ note: 'GET /api/plugins for the flat plugin list' }))

export default {
    name: 'gui-plugins-list', surfaces: 'gui',
    register({ gui, host }) {
        gui.route('GET', '/api/plugins', (_req, res) => res.json({ plugins: listFrom(host) }))
    },
}
