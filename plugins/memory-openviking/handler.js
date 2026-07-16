import { createMemoryProvider } from '../_shared/generic-rest-memory.js'
export const OpenvikingMemory = createMemoryProvider({
    name: 'openviking', className: 'OpenvikingMemory',
    base: 'https://api.openviking.com', envKey: 'OPENVIKING_API_KEY',
})
