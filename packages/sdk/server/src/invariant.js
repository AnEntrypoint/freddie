import { invariantPlugin } from '@freddie/freddie-invariants/plugin'

export const { name, inject, apply } = invariantPlugin('@freddie/freddie-sdk-jsonrpc-server', 'sdk-jsonrpc-server-invariant')
