import { createMemoryProvider } from '../_shared/generic-rest-memory.js'
export const HindsightMemory = createMemoryProvider({
    name: 'hindsight', className: 'HindsightMemory',
    base: 'https://api.hindsightai.com', envKey: 'HINDSIGHT_API_KEY',
})
