import * as mod from './handler.js'
export default { name: 'memory-hindsight', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'hindsight', module: mod }) } }
