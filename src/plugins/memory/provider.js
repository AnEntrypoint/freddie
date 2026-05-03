import { HonchoMemory, Mem0Memory, SupermemoryMemory, ByteroverMemory, HindsightMemory, HolographicMemory, OpenvikingMemory, RetaindbMemory } from './_index.js'

const _registered = new Map()

export class MemoryProvider {
    constructor(opts = {}) { this.opts = opts; this.name = 'base' }
    async syncTurn(_messages) { throw new Error('syncTurn not implemented') }
    async prefetch(_query) { throw new Error('prefetch not implemented') }
    async shutdown() {}
    async postSetup(_home, _config) {}
    getRequiredEnv() { return [] }
}

export function registerMemoryProvider(name, factory) { _registered.set(name, factory) }
export function listMemoryProviders() { return [..._registered.keys()] }
export function createMemoryProvider(name, opts) {
    const factory = _registered.get(name)
    if (!factory) throw new Error(`unknown memory provider: ${name}. Available: ${[..._registered.keys()].join(',') || 'none'}`)
    return factory(opts)
}

const PROVIDERS = {
    honcho: HonchoMemory,
    mem0: Mem0Memory,
    supermemory: SupermemoryMemory,
    byterover: ByteroverMemory,
    hindsight: HindsightMemory,
    holographic: HolographicMemory,
    openviking: OpenvikingMemory,
    retaindb: RetaindbMemory,
}

for (const [name, Cls] of Object.entries(PROVIDERS)) {
    registerMemoryProvider(name, (opts) => new Cls(opts))
}
