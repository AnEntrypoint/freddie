import { runTurn, createAgentMachine } from '../../../src/agent/machine.js'
export default {
    name: 'core-agent-machine', surfaces: 'pi',
    register({ pi }) {
        pi.agentExts.register({ name: 'runTurn', fn: runTurn })
        pi.agentExts.register({ name: 'createAgentMachine', fn: createAgentMachine })
    },
}
