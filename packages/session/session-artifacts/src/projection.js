const EMPTY_ARTIFACTS = Object.freeze({ revision: 0, items: Object.freeze([]) })

export const sessionArtifactsProjection = {
  key: 'artifacts',
  stateVersion: 1,
  init: () => EMPTY_ARTIFACTS,
  apply: (state, event) => {
    if (event.type !== 'session-artifacts/changed') return state
    const next = event.data
    if (next === null || typeof next !== 'object' || !Array.isArray(next.items)) return state
    return next.revision === state.revision && next.items === state.items ? state : next
  },
  wire: { view: state => state },
}
