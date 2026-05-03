import { bootHost } from './host/index.js'

export const _FREDDIE_CORE_TOOLS = ['bash', 'read', 'write', 'edit', 'grep']

function available(host) {
    return host.pi.tools.list().filter(t => !t.checkFn || t.checkFn(t) !== false)
}

export async function getEnabledToolSchemas(enabled = ['core'], disabled = []) {
    const h = await bootHost()
    const enabledSet = new Set(enabled); const disabledSet = new Set(disabled)
    return available(h).filter(t => enabledSet.has(t.toolset || 'core') && !disabledSet.has(t.name)).map(t => t.schema)
}

export async function getEnabledToolNames(enabled = ['core'], disabled = []) {
    const h = await bootHost()
    const enabledSet = new Set(enabled); const disabledSet = new Set(disabled)
    return available(h).filter(t => enabledSet.has(t.toolset || 'core') && !disabledSet.has(t.name)).map(t => t.name)
}

export async function getAvailableToolsets() {
    const h = await bootHost()
    return [...new Set(h.pi.tools.list().map(t => t.toolset || 'core'))]
}
