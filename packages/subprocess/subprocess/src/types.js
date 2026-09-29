export const FREDDIE_ENV_PREFIX = 'FREDDIE_'

/**
 * The live handle a `spawn()` call returns: raw piped streams (only for
 * stream-mode stdio), bounded collected readers (only for collect-mode
 * stdio), the terminal outcome, and the seam's one termination primitive.
 * @typedef {object} SubprocessHandle
 * @property {number} pid
 * @property {NodeJS.WritableStream} [stdin] - present only when stdin is piped.
 * @property {NodeJS.ReadableStream} [stdout] - present only when stdout is piped.
 * @property {NodeJS.ReadableStream} [stderr] - present only when stderr is piped.
 * @property {{ stdout?: object, stderr?: object }} collected - bounded collected readers, one per collect-mode stream.
 * @property {Promise<{ exitCode: number | null, signal: string | null }>} done - resolves at process close; rejects only for spawn-level failures.
 * @property {function(): void} terminate - escalate SIGTERM→grace→SIGKILL, tree-scoped.
 * @property {function(AbortSignal=): Promise<boolean>} waitForExit - resolve once whole-tree liveness is observed gone, or `false` if `signal` aborts first.
 */
