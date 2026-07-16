// Exposes plugins whose register() threw during boot -- captured by the
// error boundary in src/host/host.js's makePluginLoader -- for /debug
// inspection without needing to grep boot logs.
import { registerDebug } from '../../src/observability/debug.js'

export default {
    name: 'debug-plugin-failures', surfaces: 'pi',
    register({ host }) {
        registerDebug('plugin-failures', () => ({ count: host.failedPlugins().length, failures: host.failedPlugins() }))
    },
}
