/**
 * Model-facing typed tools over `ctx.gm` (`@freddie/freddie-gm-client`):
 * `gm_instruction`, `gm_phase_status`, `gm_codesearch`, `gm_recall`,
 * `gm_prd_add`, `gm_prd_resolve`, `gm_mutable_add`, `gm_mutable_resolve`,
 * `gm_transition`, `gm_exec_js`, `gm_git_finalize`, `gm_scan_deps`,
 * `gm_residual_scan` — a
 * first-class replacement for the generic MCP bridge's single opaque
 * `mcp__gm__gm(verb, body: any)` tool, each with real typed parameters and
 * output schema.
 * @module @freddie/freddie-tool-gm
 */

import { buildGmTools } from './verbs.js'

export const name = 'tool-gm'
export const inject = ['tools', 'gm']

/**
 * Reduce one successful GM response to the complete durable progress snapshot.
 * Missing GM fields are represented by `null`; the event remains log-only and
 * is safe for older readers to skip.
 * @param value - parsed response returned by the GM daemon.
 * @param sessionId - the configured GM session id used when the response omits one.
 * @param active - whether the source response identifies the configured GM session as active.
 * @returns a losslessly JSON-serializable GM progress record.
 */
export function gmProgressSnapshot(value, sessionId, active) {
  const data = value !== null && typeof value === 'object' ? value.data : undefined
  const source = data !== null && typeof data === 'object' ? data : {}
  return {
    phase: typeof source.phase === 'string' ? source.phase : null,
    prdPendingCount: typeof source.prd_pending_count === 'number'
      ? source.prd_pending_count
      : typeof source.prd_pending === 'number' ? source.prd_pending : null,
    mutablesPendingCount: typeof source.mutables_pending_count === 'number'
      ? source.mutables_pending_count
      : null,
    sessionId: typeof source.session_id === 'string' ? source.session_id : sessionId,
    active,
  }
}

/**
 * Register every gm-verb tool over the mounted `ctx.gm` service instance.
 * @param ctx - plugin context carrying the tool registry and `ctx.gm`.
 */
export function apply(ctx) {
  for (const tool of buildGmTools(ctx.gm, (value, exec) => {
    const session = exec.agent?.session
    if (session === undefined) return
    const responseSessionId = value?.data?.session_id
    const snapshot = gmProgressSnapshot(
      value,
      ctx.gm.config.sessionId,
      responseSessionId === undefined || responseSessionId === ctx.gm.config.sessionId,
    )
    session.append('gm/progress', snapshot, { ignorable: true })
  })) {
    ctx.tools.register(tool)
  }
}
