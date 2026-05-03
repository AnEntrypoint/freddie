import * as mod from './handler.js'
export default { name: 'memory-mem0', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'mem0', module: mod }) } }
