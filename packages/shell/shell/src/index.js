import { Service } from '@freddie/cordis'
import { settingsNamespace } from '@freddie/freddie-settings'

export const SHELL_SETTINGS_NAMESPACE = settingsNamespace('shell')

export { FREDDIE_ENV_PREFIX } from './types.js'
export { parseExitStatus } from './render.js'

/**
 * One stream's collected output once settled.
 * @typedef {object} CollectedOutput
 * @property {string} text - the collected text.
 * @property {boolean} truncated - whether the stream's cap was reached.
 * @property {string} [spillPath] - path of the overflow spill file, when one was written.
 */

/**
 * Foreground command result: subprocess outcome facts plus this seam's timeout/
 * cancellation classification and collected output.
 * @typedef {object} ShellRunResult
 * @property {number | null} exitCode - process exit code, or `null` on signal/timeout/abort termination.
 * @property {string | null} signal - the terminating signal name, when one ended the process.
 * @property {boolean} timedOut - whether the configured timeout killed the process.
 * @property {boolean} aborted - whether caller cancellation killed the process (distinct from `timedOut`).
 * @property {number} timeoutMs - the timeout this run was bounded by.
 * @property {CollectedOutput} stdout
 * @property {CollectedOutput} stderr
 */

/**
 * Live background process handle.
 * @typedef {object} ShellProcess
 * @property {'running' | 'completed' | 'killed'} status
 * @property {number | null} exitCode
 * @property {string | null} signal
 * @property {Promise<void>} done - settles once, at process close; never rejects.
 * @property {() => {delta: string, lossy: boolean, stdoutSpillPath?: string, stderrSpillPath?: string}} readOutput - incremental read; consecutive reads never repeat output.
 * @property {() => boolean} kill - requests termination; returns whether a running process was signaled.
 */

export class ShellExecutor extends Service {
  constructor(ctx) {
    super(ctx, 'shell')
  }

  get sandboxMode() {
    return undefined
  }

  resolve(request) {
    throw new Error('not implemented')
  }

  run(spec) {
    throw new Error('not implemented')
  }

  start(spec) {
    throw new Error('not implemented')
  }
}

export default ShellExecutor
