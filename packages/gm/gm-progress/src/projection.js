/** Pure session-projection fold for the complete GM progress event. */

const EMPTY_PROGRESS = Object.freeze({
  phase: null,
  prdPendingCount: null,
  mutablesPendingCount: null,
  sessionId: null,
  active: false,
})

/** Client-visible GM progress projection definition. */
export const gmProgressProjectionDefinition = {
  key: 'gmProgress',
  stateVersion: 1,
  init: () => EMPTY_PROGRESS,
  apply: (state, event) => event.type === 'gm/progress' ? { ...event.data } : state,
  wire: { view: state => state },
}
