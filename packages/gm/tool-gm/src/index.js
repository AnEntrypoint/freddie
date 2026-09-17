/**
 * Model-facing typed tools over `ctx.gm` (`@freddie/freddie-gm-client`):
 * `gm_instruction`, `gm_phase_status`, `gm_codesearch`, `gm_recall`,
 * `gm_prd_add`, `gm_prd_resolve`, `gm_mutable_add`, `gm_mutable_resolve`,
 * `gm_transition`, `gm_exec_js`, `gm_git_finalize`, `gm_scan_deps`,
 * `gm_dream_replay`, `gm_residual_scan` - a
 * first-class replacement for the generic MCP bridge's single opaque
 * `mcp__gm__gm(verb, body: any)` tool, each with real typed parameters and
 * output schema.
 * @module @freddie/freddie-tool-gm
 */

import { buildGmTools } from './verbs.js'

export const name = 'tool-gm'
export const inject = ['tools', 'gm']

/**
 * Reduce one GM dispatch lifecycle event to complete durable state.
 * @param dispatch - the verb, lifecycle status, timing, value, or error.
 * @param sessionId - configured GM session id used when the response omits one.
 * @param previous - prior whole snapshot for retaining semantic state on errors.
 * @returns a losslessly JSON-serializable GM progress record.
 */
export function gmProgressSnapshot(dispatch, sessionId, previous) {
  const value = dispatch.value
  const response = value !== null && typeof value === 'object' ? value : {}
  const data = response.data !== null && typeof response.data === 'object' ? response.data : {}
  const failedResponse = response.ok === false
  const error = dispatch.error === undefined
    ? typeof response.error === 'string' ? response.error : null
    : dispatch.error instanceof Error ? dispatch.error.message : String(dispatch.error)
  const status = dispatch.status === 'running'
    ? 'running'
    : dispatch.status === 'failed' || failedResponse ? 'failed' : 'completed'
  const startedAt = Number.isSafeInteger(dispatch.startedAt) ? dispatch.startedAt : Date.now()
  const finishedAt = Number.isSafeInteger(dispatch.finishedAt) ? dispatch.finishedAt : null
  return {
    verb: dispatch.verb,
    status,
    phase: typeof data.phase === 'string' ? data.phase : previous?.phase ?? null,
    prdPendingCount: typeof data.prd_pending_count === 'number'
      ? data.prd_pending_count
      : typeof data.prd_pending === 'number' ? data.prd_pending : previous?.prdPendingCount ?? null,
    mutablesPendingCount: typeof data.mutables_pending_count === 'number'
      ? data.mutables_pending_count
      : previous?.mutablesPendingCount ?? null,
    sessionId: typeof data.session_id === 'string' ? data.session_id : sessionId,
    belongsToConfiguredSession: typeof data.session_id !== 'string' || data.session_id === sessionId,
    startedAt,
    finishedAt,
    durationMs: finishedAt === null ? null : Math.max(0, finishedAt - startedAt),
    error,
  }
}

/**
 * Register every gm-verb tool over the mounted `ctx.gm` service instance.
 * @param ctx - plugin context carrying the tool registry and `ctx.gm`.
 */
export function apply(ctx) {
  const latestBySession = new WeakMap()
  const checkpointOf = (session) => latestBySession.get(session)
    ?? ctx.get('sessionProjections')?.snapshot(session).values.gmProgress
  for (const tool of buildGmTools(ctx.gm, (dispatch, exec) => {
    const session = exec.agent?.session
    if (session === undefined) return
    const snapshot = gmProgressSnapshot(dispatch, ctx.gm.config.sessionId, checkpointOf(session))
    try {
      session.append('gm/progress', snapshot, { ignorable: true })
      latestBySession.set(session, snapshot)
    } catch (error) {
      void error
    }
  })) {
    ctx.tools.register(tool)
  }
}
