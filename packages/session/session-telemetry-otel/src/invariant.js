import { invariantPlugin } from '@freddie/freddie-invariants/plugin'

export const { name, inject, apply } = invariantPlugin('@freddie/freddie-session-telemetry-otel', 'session-telemetry-otel-invariant')
