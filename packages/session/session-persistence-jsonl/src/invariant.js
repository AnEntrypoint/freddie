import { invariantPlugin } from '@freddie/freddie-invariants/plugin'

export const { name, inject, apply } = invariantPlugin('@freddie/freddie-session-persistence-jsonl', 'session-persistence-jsonl-invariant')
