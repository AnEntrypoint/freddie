import { registry } from './registry.js'

registry.register({
    name: 'managed_tool_gateway',
    toolset: 'core',
    schema: { name: 'managed_tool_gateway', description: 'Proxy: dispatch any registered tool by name with arguments. Used for tool-level audit and policy interception.', parameters: { type: 'object', properties: { name: { type: 'string' }, arguments: {} }, required: ['name'] } },
    handler: async ({ name, arguments: args = {} }, ctx = {}) => {
        if (typeof ctx.audit === 'function') ctx.audit({ name, args })
        return { result: await registry.dispatch(name, args, ctx) }
    },
})
