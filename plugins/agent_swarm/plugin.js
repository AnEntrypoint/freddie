import { _tool } from './handler.js'

export default {
    name: 'agent_swarm',
    surfaces: 'pi',
    // handler.js statically imports runSubagent from plugins/core/delegate's
    // lib/runner.js -- core/delegate has no plugin.js of its own, so it
    // auto-registers via the legacy handler.js-only fallback (see AGENTS.md's
    // "Adding a tool" section) under the name 'tool-delegate'. This requires
    // entry makes that real coupling visible to gui-plugin-graph's
    // dependency visualization (which reads ONLY the requires array, not
    // static imports) and enforces load-order/presence via topoSort.
    requires: ['tool-delegate'],
    register({ pi }) {
        pi.tools.register(_tool)
    },
}