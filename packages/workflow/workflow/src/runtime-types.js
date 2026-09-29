/**
 * Host-only workflow request and live-run handles. The browser-safe durable
 * vocabulary remains in `./types` so Client programs never import Agent or
 * host Cordis context declarations.
 *
 * @module @freddie/freddie-workflow
 */

/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */

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
