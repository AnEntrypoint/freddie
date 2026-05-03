import * as mod from './handler.js'
export default { name: 'memory-openviking', surfaces: 'pi', register({ pi }) { pi.memory.register({ name: 'openviking', module: mod }) } }
