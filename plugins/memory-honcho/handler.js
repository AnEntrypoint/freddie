import { createMemoryProvider } from '../_shared/generic-rest-memory.js'
export const HonchoMemory = createMemoryProvider({
    name: 'honcho', className: 'HonchoMemory',
    base: 'https://api.honcho.dev', envKey: 'HONCHO_API_KEY',
})
