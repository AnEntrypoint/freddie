// Flat plugin list for the dashboard's Plugins panel (design SDK's
// PluginsConfig component): {name, surfaces, requires, source, enabled}
// per plugin — distinct from gui-plugin-graph's D3 {nodes,edges} shape,
// which is built for the dependency-graph visualization, not a list UI.
//
// Runtime enable/disable (POST /api/plugins/:name) is real: it delegates to
// host.disablePlugin()/host.enablePlugin() (src/host/host.js), which
// unregister/re-register the plugin's tools/routes/hooks by provenance and
// persist the choice via src/flags.js so a restart honors it. A currently-
// loaded plugin is reported enabled:true; one parked in host.disabledPlugins()
// (flag-skipped at boot, or disabled at runtime) is enabled:false and still
// listed — never dropped from the response — so the toggle has something to
// turn back on.
import { registerDebug } from '../../../src/observability/debug.js'

function listFrom(host) {
    // host.plugins() returns {name,version,surfaces,requires,enabled:true};
    // the real loaded plugin object (with __sourceFile) lives behind
    // host.get(name) — pull the source path from there. Disabled plugins
    // don't have a `loaded` entry, so host.disabledPlugins() carries its own
    // `source` field (read directly off the parked plugin object).
    const active = host.plugins().map(p => ({
        name: p.name,
        version: p.version,
        surfaces: p.surfaces,
        requires: p.requires || [],
        source: (host.get(p.name) || {}).__sourceFile || null,
        enabled: true,
    }))
    const inactive = (host.disabledPlugins ? host.disabledPlugins() : []).map(p => ({
        name: p.name,
        version: p.version,
        surfaces: p.surfaces,
        requires: p.requires || [],
        source: p.source || null,
        enabled: false,
    }))
    return [...active, ...inactive]
}

registerDebug('plugins-list', () => ({ note: 'GET /api/plugins for the flat plugin list; POST /api/plugins/:name {enabled} to toggle' }))

export default {
    name: 'gui-plugins-list', surfaces: 'gui',
    register({ gui, host }) {
        gui.route('GET', '/api/plugins', (_req, res) => res.json({ plugins: listFrom(host) }))
        gui.route('POST', '/api/plugins/:name', async (req, res) => {
            const { name } = req.params
            if (!host.get(name) && !(host.disabledPlugins && host.disabledPlugins().some(p => p.name === name))) {
                return res.status(404).json({ error: `unknown plugin '${name}'` })
            }
            const wantEnabled = !!(req.body && req.body.enabled)
            const currentlyEnabled = !!host.get(name)
            if (wantEnabled === currentlyEnabled) return res.json({ ok: true, name, enabled: currentlyEnabled })
            // host.disablePlugin/enablePlugin (src/host/host.js) can throw --
            // a self-disable/dependency-guard refusal, an in-flight-toggle
            // conflict, or (enable only) a plugin's own register() throwing
            // mid-re-registration. None of those are a 404/programmer-error
            // shape; catch and report as a 409 conflict rather than letting
            // an unhandled rejection surface as a bare 500 with no message.
            let ok
            try {
                ok = wantEnabled ? await host.enablePlugin(name) : host.disablePlugin(name)
            } catch (e) {
                return res.status(409).json({ error: String(e?.message || e) })
            }
            if (!ok) return res.status(500).json({ error: `failed to ${wantEnabled ? 'enable' : 'disable'} '${name}'` })
            return res.json({ ok: true, name, enabled: wantEnabled })
        })
    },
}
