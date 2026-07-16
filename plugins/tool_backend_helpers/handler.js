export function shapeArgs(schema, args) {
    if (!schema?.properties) return args
    const out = {}
    for (const [k, def] of Object.entries(schema.properties)) {
        if (k in args) out[k] = args[k]
        else if ('default' in def) out[k] = def.default
    }
    return out
}
import { host } from '../../src/host/index.js'

export function describeTools(list, filter = null) {
    let out = list
    if (filter) out = out.filter(t => t.toolset === filter)
    return out.map(t => ({ name: t.name, description: t.schema.description, toolset: t.toolset }))
}
export const _tool = ({
    name: 'tool_backend_helpers',
    toolset: 'core',
    schema: { name: 'tool_backend_helpers', description: 'Helper meta-tool: describeTools(filter), shapeArgs(schema, args).', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['describe', 'shape'] }, filter: { type: 'string' }, schema: {}, args: {} }, required: ['action'] } },
    handler: async ({ action, filter, schema, args }) => {
        if (action === 'describe') return { tools: describeTools(host()?.pi?.tools?.list() || [], filter) }
        if (action === 'shape') return { args: shapeArgs(schema, args || {}) }
        return { error: 'unknown action' }
    },
})
