import { createMemoryProvider } from '../_shared/generic-rest-memory.js'
export const Mem0Memory = createMemoryProvider({
    name: 'mem0', className: 'Mem0Memory',
    base: 'https://api.mem0.ai/v1', envKey: 'MEM0_API_KEY',
})
