import { bootHost } from './host/index.js'
import { sanitizeSchema } from './host/tool-middleware.js'

export const _FREDDIE_CORE_TOOLS = ['bash', 'read', 'write', 'edit', 'grep']

function available(host) {
    return host.pi.tools.list().filter(t => !t.checkFn || t.checkFn(t) !== false)
}

export async function getEnabledToolSchemas(enabled = ['core'], disabled = []) {
    const h = await bootHost()
    const enabledSet = new Set(enabled); const disabledSet = new Set(disabled)
    return available(h).filter(t => enabledSet.has(t.toolset || 'core') && !disabledSet.has(t.name)).map(t => sanitizeSchema(t.schema))
}

export async function getEnabledToolNames(enabled = ['core'], disabled = []) {
    const h = await bootHost()
    const enabledSet = new Set(enabled); const disabledSet = new Set(disabled)
    return available(h).filter(t => enabledSet.has(t.toolset || 'core') && !disabledSet.has(t.name)).map(t => t.name)
}

export async function getAvailableToolsets() {
    const h = await bootHost()
    return [...new Set(available(h).map(t => t.toolset || 'core'))]
}
