import { compress, shouldCompress } from '../../../src/agent/compress/index.js'
export default {
    name: 'core-compressor', surfaces: 'pi', requires: ['core-agent-machine'],
    register({ pi }) {
        // The live compaction call site is src/agent/machine.js's prompting state
        // (compress() with didCompress -> context replacement). The preLlmCall
        // hook that used to sit here was doubly dead: machine.js never invokes a
        // 'preLlmCall' hook, and it read plan?.compressed, a field
        // computeCompressionPlan never returns (and it passed a bare array where
        // the API takes {messages}). agentExt registrations stay for external
        // consumers (npm import { compress }).
        pi.agentExts.register({ name: 'compress', fn: compress })
        pi.agentExts.register({ name: 'shouldCompress', fn: shouldCompress })
    },
}
