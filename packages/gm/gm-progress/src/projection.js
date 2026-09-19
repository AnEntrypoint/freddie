/** Pure session-projection fold for the complete GM progress event. */

const EMPTY_PROGRESS = Object.freeze({
  verb: null,
  status: 'idle',
  phase: null,
  prdPendingCount: null,
  mutablesPendingCount: null,
  sessionId: null,
  belongsToConfiguredSession: false,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  error: null,
  nodes: Object.freeze([]),
  edges: Object.freeze([]),
  walking: null,
})

/** Client-visible GM progress projection definition. */
export const gmProgressProjectionDefinition = {
  key: 'gmProgress',
  stateVersion: 3,
  init: () => EMPTY_PROGRESS,
  apply: (state, event) => {
    if (event.type !== 'gm/progress') return state
    const next = { ...event.data }
    if (!Array.isArray(next.nodes)) next.nodes = []
    if (!Array.isArray(next.edges)) next.edges = []
    if (next.walking === undefined) next.walking = null
    for (const key of Object.keys(next)) {
      if (next[key] !== state[key]) return next
    }
    return Object.keys(state).every(key => key in next) ? state : next
  },
  wire: { view: state => state },
}
