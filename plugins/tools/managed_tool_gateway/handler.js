import { host } from '../../../src/host/index.js'

export const _tool = ({
    name: 'managed_tool_gateway',
    toolset: 'core',
    schema: { name: 'managed_tool_gateway', description: 'Proxy: dispatch any registered tool by name with arguments. Used for tool-level audit and policy interception.', parameters: { type: 'object', properties: { name: { type: 'string' }, arguments: {} }, required: ['name'] } },
    handler: async ({ name, arguments: args = {} }, ctx = {}) => {
        if (typeof ctx.audit === 'function') ctx.audit({ name, args })
        // `registry` was never defined anywhere in this file (threw
        // ReferenceError on every call) -- the real per-tool dispatch surface
        // is host().pi.dispatchTool (src/host/surface-factories.js), the same
        // path machine_builder.js's own tool-calling loop uses.
        const h = host()
        if (!h) return { error: 'host not booted' }
        const raw = await h.pi.dispatchTool(name, args, ctx, {})
        return { result: typeof raw === 'string' ? JSON.parse(raw) : raw }
    },
})
