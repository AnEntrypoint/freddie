import * as mod from './handler.js'
export default { name: 'memory-honcho', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'honcho', module: mod }) } }
