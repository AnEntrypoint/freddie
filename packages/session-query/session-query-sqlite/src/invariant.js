import { invariantPlugin } from '@freddie/freddie-invariants/plugin'

export const { name, inject, apply } = invariantPlugin('@freddie/freddie-session-query-sqlite', 'session-query-sqlite-invariant')
