import * as mod from './handler.js'
export default { name: 'memory-supermemory', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'supermemory', module: mod }) } }
