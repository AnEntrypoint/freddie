import { host, bootHost } from '../../host/index.js'

const _custom = new Map()

function ensureBoot() {
    const h = host()
    return h.pi && h.pi.memory.size() > 0 ? h : bootHost()
}

export function listMemoryProviders() {
    const h = host()
    const names = (h.pi && h.pi.memory) ? h.pi.memory.list().map(m => m.name) : []
    return [...new Set([...names, ..._custom.keys()])]
}

export function createMemoryProvider(name, opts = {}) {
    if (_custom.has(name)) return new (_custom.get(name))(opts)
    const h = host()
    const rec = h.pi?.memory.get(name)
    if (!rec) throw new Error(`memory provider not found: ${name}. Boot host first or register a provider class.`)
    const mod = rec.module || {}
    const cls = Object.values(mod).find(v => typeof v === 'function' && /Memory$/.test(v.name)) || Object.values(mod).find(v => typeof v === 'function')
    if (!cls) throw new Error(`memory provider ${name}: no class exported`)
    return new cls(opts)
}

export function registerMemoryProvider(name, cls) { _custom.set(name, cls) }

export class MemoryProvider {
    constructor(opts = {}) { Object.assign(this, opts) }
    async syncTurn() {}
    async prefetch() { return { items: [] } }
}

export async function ensureProvidersLoaded() { await ensureBoot() }
