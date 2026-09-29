export function WorkflowRunId(id) {
  return id
}

/**
 * One phase declared in a script's `meta.phases` (progress vocabulary only —
 * phases group agents in observers/UIs; they impose no execution structure).
 * @typedef {object} WorkflowPhase
 * @property {string} title
 * @property {string} [detail]
 * @property {string} [provider]
 * @property {string} [model]
 */

/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 * @typedef {object} WorkflowMeta
 * @property {string} name
 * @property {string} description
 * @property {string} [whenToUse]
 * @property {WorkflowPhase[]} [phases]
 */

/**
 * Why a run settled. CLOSED union (engine-owned, consumers may exhaust):
 * `completed` = the script ran to its final `return`; `cancelled` = the run
 * was cancelled (caller `cancel()`/signal); `error` = the script threw, a
 * fatal `WorkflowError` propagated, or the result failed materialization.
 * @typedef {'completed' | 'cancelled' | 'error'} WorkflowStopReason
 */

/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 * @typedef {object} WorkflowResult
 * @property {*} value - plain JSON data, or `null`; meaningful only for `completed`.
 * @property {WorkflowStopReason} stopReason
 * @property {string} [error] - present for a non-`completed` reason.
 * @property {number} agentsStarted
 */

/**
 * Identifying detail for a run, carried by every `workflow/*` event as borrowed immutable data, never the live run.
 * @typedef {object} WorkflowRunIdentity
 * @property {WorkflowRunId} id
 * @property {WorkflowMeta} meta
 */

/**
 * One `agent()` call's identity within a run (the `workflow/agent-start` payload).
 * @typedef {object} WorkflowAgentStartInfo
 * @property {number} seq - 1-based `agent()` call order within the run.
 * @property {string} label
 * @property {string} [phase] - the current `phase()` title, when one was set.
 * @property {import('@freddie/freddie-session').SessionId} childId
 */

/**
 * How one `agent()` call settled: clean result, child failure (script sees `null`), or run cancellation.
 * @typedef {'completed' | 'failed' | 'cancelled'} WorkflowAgentOutcome
 */

/**
 * One `agent()` call's settlement (the `workflow/agent-end` payload).
 * @typedef {WorkflowAgentStartInfo & { outcome: WorkflowAgentOutcome }} WorkflowAgentEndInfo
 */

/**
 * A settled run's outcome as event data (the `workflow/end` payload): the
 * WorkflowResult minus `value` (a listener observing outcomes must not
 * receive a mutable alias of the caller's result value; a consumer that needs
 * the value holds the run and awaits `result`).
 * @typedef {object} WorkflowEndInfo
 * @property {WorkflowStopReason} stopReason
 * @property {string} [error]
 * @property {number} agentsStarted
 */
