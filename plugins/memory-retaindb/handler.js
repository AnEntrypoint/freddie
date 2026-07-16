import { createMemoryProvider } from '../_shared/generic-rest-memory.js'
export const RetaindbMemory = createMemoryProvider({
    name: 'retaindb', className: 'RetaindbMemory',
    base: 'https://api.retaindb.com', envKey: 'RETAINDB_API_KEY',
})
