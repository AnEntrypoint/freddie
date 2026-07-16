import { inc, metricsText } from '../../src/plugins/observability/index.js'
export default {
    name: 'observability', surfaces: 'both',
    register({ hooks, gui }) {
        hooks.on('preToolCall', async (p) => { inc('tool_calls_total'); inc(`tool_call:${p?.name || 'unknown'}`); return p })
        gui.route('GET', '/metrics', (_, res) => { res.set('content-type', 'text/plain'); res.send(metricsText()) })
    },
}
