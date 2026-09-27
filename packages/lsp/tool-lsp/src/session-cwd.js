/**
 * Derive the workspace root an `lsp` call resolves against from the calling
 * agent's session. A missing cwd fails as `LSP_WORKSPACE_REQUIRED` because the
 * local provider must canonicalize a real workspace before starting a server.
 */

/**
 * The session workspace cwd for this call, or `undefined` when none applies.
 * @param {import('@freddie/freddie-tools').ToolExecution} exec - the tool-execution context; only its optional `agent` is read.
 * @returns {string | undefined} the calling agent's session cwd, or undefined for a non-agent caller.
 */
export function sessionCwd(exec) {
  return exec.agent?.session.header.cwd
}
