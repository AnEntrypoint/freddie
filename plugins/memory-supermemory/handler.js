import { createMemoryProvider } from '../_shared/generic-rest-memory.js'
export const SupermemoryMemory = createMemoryProvider({
    name: 'supermemory', className: 'SupermemoryMemory',
    base: 'https://api.supermemory.ai/v3', envKey: 'SUPERMEMORY_API_KEY',
})
