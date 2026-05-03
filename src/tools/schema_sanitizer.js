import { registry } from './registry.js'
const DANGEROUS_PARAM_NAMES = new Set(['eval', 'exec', '__proto__', 'constructor'])
export function sanitizeSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema
    const out = JSON.parse(JSON.stringify(schema))
    if (out.parameters?.properties) {
        for (const k of Object.keys(out.parameters.properties)) {
            if (DANGEROUS_PARAM_NAMES.has(k)) delete out.parameters.properties[k]
        }
    }
    return out
}
registry.register({
    name: 'schema_sanitizer',
    toolset: 'core',
    schema: { name: 'schema_sanitizer', description: 'Strip dangerous fields (eval, exec, __proto__) from a tool schema.', parameters: { type: 'object', properties: { schema: {} }, required: ['schema'] } },
    handler: async ({ schema }) => ({ sanitized: sanitizeSchema(schema) }),
})
