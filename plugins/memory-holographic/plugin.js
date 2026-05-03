import * as mod from './handler.js'
export default { name: 'memory-holographic', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'holographic', module: mod }) } }
