import { registry, discoverBuiltinTools } from './tools/registry.js'

export const _FREDDIE_CORE_TOOLS = ['bash', 'read', 'write', 'edit', 'grep']

export async function getEnabledToolSchemas(enabled = ['core'], disabled = []) {
    await discoverBuiltinTools()
    const all = registry.available()
    const enabledSet = new Set(enabled)
    const disabledSet = new Set(disabled)
    return all.filter(t => enabledSet.has(t.toolset) && !disabledSet.has(t.name)).map(t => t.schema)
}

export async function getEnabledToolNames(enabled = ['core'], disabled = []) {
    await discoverBuiltinTools()
    const all = registry.available()
    const enabledSet = new Set(enabled)
    const disabledSet = new Set(disabled)
    return all.filter(t => enabledSet.has(t.toolset) && !disabledSet.has(t.name)).map(t => t.name)
}

export async function getAvailableToolsets() {
    await discoverBuiltinTools()
    const ts = new Set()
    for (const t of registry.list()) ts.add(t.toolset)
    return [...ts]
}
