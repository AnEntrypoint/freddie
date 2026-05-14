export async function getEnabledToolSchemas(enabled = ['core'], disabled = []) {
    const br = globalThis.__freddieRuntimeBridge
    if (!br || !br.host) return []
    const host = br.host
    const disabledSet = new Set(disabled)
    const out = []
    for (const [name, t] of host.pi.tools.entries()) {
        if (disabledSet.has(name)) continue
        out.push({ type: 'function', function: { name, description: t.description || '', parameters: t.inputSchema || { type: 'object', properties: {} } } })
    }
    return out
}
export async function getEnabledToolNames(enabled = ['core'], disabled = []) {
    const br = globalThis.__freddieRuntimeBridge; if (!br || !br.host) return []
    return [...br.host.pi.tools.keys()]
}
export async function getAvailableToolsets() { return ['core'] }
export const _FREDDIE_CORE_TOOLS = ['read','write','edit','grep','list']
