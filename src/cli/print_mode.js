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

  // Tear down cleanly: close undici keep-alive sockets so the event loop drains
  // without a UV_HANDLE_CLOSING assertion on Windows (same as `freddie exec`).
  try {
    const u = await import('undici')
    await u.getGlobalDispatcher()?.close?.()
  } catch {}

  return result
}