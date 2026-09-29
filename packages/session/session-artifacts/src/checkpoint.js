const FOLDED_KINDS = Object.freeze(['plan', 'decision', 'evidence'])

export const EMPTY_CHECKPOINT = Object.freeze({
  sourceSeq: -1,
  artifactsRevision: 0,
  views: Object.freeze({
    plan: Object.freeze([]),
    decision: Object.freeze([]),
    evidence: Object.freeze([]),
    activity: Object.freeze({ events: 0, byType: Object.freeze({}), lastType: null, lastSeq: -1, lastTime: null }),
  }),
})

function entryOf(item, foldedAtSeq) {
  return Object.freeze({
    id: item.id,
    name: item.name,
    revision: item.revision,
    bytes: item.bytes,
    updatedAt: item.updatedAt,
    actor: item.provenance?.actor ?? null,
    sourceSeq: item.provenance?.sourceSeq ?? null,
    foldedAtSeq,
  })
}

function foldArtifacts(state, event) {
  const view = event.data
  if (view === null || typeof view !== 'object' || !Array.isArray(view.items)) return state
  const views = { ...state.views }
  for (const kind of FOLDED_KINDS) {
    views[kind] = Object.freeze(view.items
      .filter(item => item.kind === kind && item.status === 'active' && item.sharedFrom === undefined)
      .map(item => state.views[kind].find(candidate => candidate.id === item.id && candidate.revision === item.revision) ?? entryOf(item, event.seq)))
  }
  return { ...state, artifactsRevision: view.revision, views }
}

export function foldCheckpoint(state, event) {
  if (event.seq <= state.sourceSeq) return state
  const activity = state.views.activity
  const folded = event.type === 'session-artifacts/changed' ? foldArtifacts(state, event) : state
  return Object.freeze({
    ...folded,
    sourceSeq: event.seq,
    views: Object.freeze({
      ...folded.views,
      activity: Object.freeze({
        events: activity.events + 1,
        byType: Object.freeze({ ...activity.byType, [event.type]: (activity.byType[event.type] ?? 0) + 1 }),
        lastType: event.type,
        lastSeq: event.seq,
        lastTime: event.time ?? null,
      }),
    }),
  })
}

export function foldCheckpointRange(state, events) {
  return events.reduce(foldCheckpoint, state)
}

export function freshness(sourceSeq, headSeq) {
  return Object.freeze({ sourceSeq, headSeq, lag: Math.max(0, headSeq - sourceSeq), fresh: sourceSeq >= headSeq })
}
