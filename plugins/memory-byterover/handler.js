import { createMemoryProvider } from '../_shared/generic-rest-memory.js'
export const ByteroverMemory = createMemoryProvider({
    name: 'byterover', className: 'ByteroverMemory',
    base: 'https://api.byterover.com', envKey: 'BYTEROVER_API_KEY',
})
