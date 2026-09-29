/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 * @typedef {object} WorkflowRun
 * @property {import('./types.js').WorkflowRunId} id
 * @property {import('./types.js').WorkflowMeta} meta
 * @property {Promise<import('./types.js').WorkflowResult>} result
 * @property {function(string=): void} cancel
 * @property {function(): Promise<void>} dispose
 */
