// Live-turn registry — the control plane for in-flight agent turns.
//
// runTurn/resumeTurn register their actor here so external surfaces (the
// `freddie wire` stdio server, the gui-agent WebSocket, the REPL) can interact
// with a RUNNING turn instead of waiting for it to finish:
//
//   subscribeTurn(key, fn)     — stream of event envelopes (src/agent/events.js)
//   steerTurn(key, text)       — inject a user message consumed at the next
//                                tool_calls→prompting boundary (kimi's SteerInput)
//   cancelTurn(key)            — INTERRUPT the machine (takes effect at the
//                                next state boundary)
//   requestApproval / resolveApproval — pause-before-tool-dispatch gate driven
//                                by agent.approval_policy
//
// The registry is process-local by design (single-process dashboard/CLI); the
// wire log (<FREDDIE_HOME>/wire/*.jsonl) is the cross-process/durable record.
//
// This file is a thin re-export entrypoint — the actual implementation is
// split by cohesive responsibility across:
//   turn-registry.js  — shared in-memory state (turns/sessionQueues/toolCounts
//                        Maps) + registry CRUD (register/get/unregister/list)
//   turn-steering.js  — steer/queue/drain/unqueue + cancelTurn
//   turn-approval.js  — requestApproval/resolveApproval/loadApprovalGrants
//   turn-revert.js    — revertTurn (checkpoint D-Mail class)
// All previously-exported symbols remain importable from this same path.

export {
    registerTurn,
    claimTurn,
    mergeTurnEntry,
    getTurn,
    unregisterTurn,
    listLiveTurns,
    subscribeTurn,
    noteToolCall,
    getToolCount,
    growthSinceLastDecay,
    markDecayCheckpoint,
    noteUsage,
    getUsageTotals,
} from './turn-registry.js'

export {
    steerTurn,
    queueTurn,
    drainQueue,
    unqueueLast,
    unqueueFirst,
    queueDepth,
    cancelTurn,
} from './turn-steering.js'

export {
    loadApprovalGrants,
    requestApproval,
    resolveApproval,
} from './turn-approval.js'

export { requestQuestion, resolveQuestion } from './turn-question.js'

export { revertTurn } from './turn-revert.js'
