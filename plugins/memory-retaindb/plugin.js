import * as mod from './handler.js'
export default { name: 'memory-retaindb', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'retaindb', module: mod }) } }
