import { createMemoryProvider, listMemoryProviders } from '../plugins/memory/provider.js'
import { getConfigValue } from '../config.js'
let _provider = null
export function getMemoryProvider() {
    if (_provider) return _provider
    const name = getConfigValue('memory.provider')
    if (!name) return null
    try { _provider = createMemoryProvider(name, getConfigValue('memory.options', {})) } catch { _provider = null }
    return _provider
}
export async function syncTurnIfConfigured(messages) { const p = getMemoryProvider(); if (p) try { return await p.syncTurn(messages) } catch (e) { return { error: String(e.message || e) } } return null }
export async function prefetchIfConfigured(query) { const p = getMemoryProvider(); if (p) try { return await p.prefetch(query) } catch { return { items: [] } } return { items: [] } }
export function listAvailable() { return listMemoryProviders() }
export function resetForTests() { _provider = null }
