/**
 * Print mode: non-interactive, one-shot execution.
 * Outputs result to stdout, exits with appropriate code.
 *
 * Four UI modes in the freddie/kimi parity model:
 *   Shell  — interactive TUI (pi-tui InteractiveMode or readline REPL)
 *   Print  — non-interactive stdout (this module)
 *   ACP    — JSON-RPC stdio (src/acp/server.js)
 *   Web    — dashboard (src/web/server.js)
 */

import { runTurn } from '../agent/machine.js'

/**
 * askUser implementation for print mode. Interactive questions are not available
 * in a non-interactive pipe — this throws immediately so the model gets a clear
 * error rather than hanging forever on a readline that will never receive input.
 */
function printModeAskUser() {
  throw new Error('Interactive questions are not available in print mode')
}

/**
 * askApproval implementation for print mode. All tool calls are auto-approved
 * (equivalent to invocation-only yolo mode). Print mode is a non-interactive
 * pipe — there is no TTY to prompt on, so the only safe default is to allow.
 */
function printModeAskApproval() {
  return Promise.resolve({ decision: 'allow' })
}

/**
 * Run a single prompt in print mode and return the result object.
 * Does NOT call process.exit() — the caller owns the exit code.
 *
 * @param {Object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]
 * @param {string} [opts.provider]
 * @param {number} [opts.timeout]
 * @param {string} [opts.cwd]
 * @param {Array} [opts.messages]
 * @returns {Promise<{messages: Array, result: string|null, error: string|null, iterations: number}>}
 */
export async function runPrintMode({ prompt, model, provider, timeout, cwd, messages }) {
  const result = await runTurn({
    prompt,
    model,
    provider,
    timeoutMs: timeout || 60000,
    cwd,
    messages: messages || [],
    toolCtx: {
      askUser: printModeAskUser,
      askApproval: printModeAskApproval,
    },
  })

  return result
}

/**
 * Run a single prompt in print mode and write output to stdout/stderr, then exit.
 * This is the CLI-facing entry point — handles output formatting and exit code.
 *
 * @param {Object} opts — same as runPrintMode
 */
export async function runPrintModeAndExit(opts) {
  const result = await runPrintMode(opts)

  if (result.error) {
    console.error('Error:', result.error)
    process.exitCode = 1
  } else {
    const output = result.result || result.messages?.at(-1)?.content || '(no output)'
    console.log(output)
    process.exitCode = 0
  }

  // Close every handle this turn is actually responsible for (undici's HTTP
  // dispatcher, the libsql sessions.js handle, log streams) before returning.
  // acptoapi's own background subsystems (extra-providers probe, readiness's
  // preemptive prober) hold undici sockets open past this turn's own
  // completion -- destroy() (not close()) is correct since close() waits on
  // in-flight requests this process no longer cares about. closeDb()/closeAll()
  // are AGENTS.md's documented Windows gotcha (libsql native handle + log
  // stream must close before exit or the open handle keeps the loop alive).
  try {
    const u = await import('undici')
    await u.getGlobalDispatcher()?.destroy?.()
  } catch {}
  try {
    const { closeDb } = await import('../sessions.js')
    closeDb()
  } catch {}
  try {
    const { closeAll } = await import('../observability/log.js')
    closeAll()
  } catch {}
  // Even after closing every handle this process owns, a live diagnostic
  // (process._getActiveHandles()/_getActiveRequests(), confirmed empty
  // post-cleanup on the `freddie exec` path this shares its teardown shape
  // with) proved the process still would not exit on its own -- some
  // native-addon-level libuv reference outside JS introspection (likely
  // libsql or agentplug-runner bindings) keeps the loop alive with nothing
  // left for JS code to close. process.exit() is safe here specifically
  // because it now runs only after every handle this process owns has
  // already been torn down.
  process.exit(process.exitCode)
}