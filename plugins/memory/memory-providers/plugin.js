// Consolidated memory-provider plugin. Replaces 8 formerly-separate
// memory-<name> directories with one registration point:
//   - 7 providers are pure REST wrappers (endpoint + auth header + field
//     names only) driven by ../../_shared/generic-rest-memory.js's
//     createMemoryProvider() factory via the descriptor table below.
//   - 1 provider (holographic) has genuinely divergent logic (filesystem
//     storage, no network/auth at all) and keeps its own adapter module
//     under ./lib/holographic-adapter.js per the "small adapter module"
//     allowance for providers whose APIs diverge from the REST shape.
import { createMemoryProvider } from '../../_shared/generic-rest-memory.js'
import { HolographicMemory } from './lib/holographic-adapter.js'

// Config-driven REST providers: name/className/base/envKey only, ~4 lines each.
const REST_PROVIDERS = [
    { name: 'byterover', className: 'ByteroverMemory', base: 'https://api.byterover.com', envKey: 'BYTEROVER_API_KEY' },
    { name: 'hindsight', className: 'HindsightMemory', base: 'https://api.hindsightai.com', envKey: 'HINDSIGHT_API_KEY' },
    { name: 'honcho', className: 'HonchoMemory', base: 'https://api.honcho.dev', envKey: 'HONCHO_API_KEY' },
    { name: 'mem0', className: 'Mem0Memory', base: 'https://api.mem0.ai/v1', envKey: 'MEM0_API_KEY' },
    { name: 'openviking', className: 'OpenvikingMemory', base: 'https://api.openviking.com', envKey: 'OPENVIKING_API_KEY' },
    { name: 'retaindb', className: 'RetaindbMemory', base: 'https://api.retaindb.com', envKey: 'RETAINDB_API_KEY' },
    { name: 'supermemory', className: 'SupermemoryMemory', base: 'https://api.supermemory.ai/v3', envKey: 'SUPERMEMORY_API_KEY' },
]

export default {
    name: 'memory-providers',
    surfaces: 'pi',
    register({ pi }) {
        for (const cfg of REST_PROVIDERS) {
            const cls = createMemoryProvider(cfg)
            pi.memory.register({ name: cfg.name, module: { [cfg.className]: cls } })
        }
        pi.memory.register({ name: 'holographic', module: { HolographicMemory } })
    },
}
