import { invariantPlugin } from '@freddie/freddie-invariants/plugin'

export const { name, inject, apply } = invariantPlugin('@freddie/freddie-storage-json', 'storage-json-invariant')
