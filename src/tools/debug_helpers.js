import { registry } from './registry.js'
import { snapshotAll, listDebug } from '../observability/debug.js'

registry.register({
    name: 'debug_helpers',
    toolset: 'core',
    schema: { name: 'debug_helpers', description: 'Inspect any registered /debug subsystem.', parameters: { type: 'object', properties: { name: { type: 'string' } } } },
    handler: async ({ name }) => name ? snapshotAll()[name] || { error: 'unknown subsystem: ' + name } : { subsystems: listDebug() },
})
