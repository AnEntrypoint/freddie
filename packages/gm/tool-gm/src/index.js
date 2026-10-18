import { foldGmGraph } from './graph.js'
import { buildGmTools } from './verbs.js'

export const name = 'tool-gm'
export const inject = ['tools', 'gm']

export function gmProgressSnapshot(dispatch, sessionId, previous, runtime) {
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
    runtime: runtime ?? previous?.runtime ?? null,
    ...foldGmGraph(previous, dispatch, data),
  }
}

export function apply(ctx) {
  const latestBySession = new WeakMap()
  const checkpointOf = (session) => latestBySession.get(session)
    ?? ctx.get('sessionProjections')?.snapshot(session).values.gmProgress
  for (const tool of buildGmTools(ctx.gm, async (dispatch, exec) => {
    const session = exec.agent?.session
    if (session === undefined) return
    let runtime
    try {
      runtime = await ctx.gm.runtimeStatus(session.header.cwd)
    } catch (error) {
      void error
    }
    const snapshot = gmProgressSnapshot(dispatch, ctx.gm.config.sessionId, checkpointOf(session), runtime)
    try {
      session.append('gm/progress', snapshot, { ignorable: true })
      const data = dispatch.value?.data
      if (dispatch.verb === 'instruction' && data?.session_id === ctx.gm.config.sessionId
        && data.dream_rsi_strategy !== null && data.dream_rsi_replay !== null) {
        session.append('gm/dream-rsi', {
          strategy: data.dream_rsi_strategy,
          replay: data.dream_rsi_replay,
          sessionId: data.session_id,
        }, { ignorable: true })
      }
      latestBySession.set(session, snapshot)
    } catch (error) {
      void error
    }
  })) {
    ctx.tools.register(tool)
  }
}

