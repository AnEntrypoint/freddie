import * as mod from './handler.js'
export default { name: 'memory-byterover', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'byterover', module: mod }) } }
