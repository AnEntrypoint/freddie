import { foldSubagentDescriptor } from './descriptor.js'

/**
 * Fold state for a subagent's latest timing snapshot.
 * @typedef {object} SubagentTimingFoldState
 * @property {boolean} descriptorSeen
 * @property {number} settledMs
 * @property {number} [pendingTurnStart] - a turn-start time observed before the descriptor.
 * @property {{ since: number, through: number }} [active] - the in-progress active span, if any.
 */

export const subagentTimingProjectionDefinition = {
  key: 'subagentTiming',
  init: () => ({ descriptorSeen: false, settledMs: 0 }),
  apply: (state, event) => {
    if (event.type === 'turn/start') {
      return state.descriptorSeen
        ? { ...state, active: { since: event.time, through: event.time } }
        : { ...state, pendingTurnStart: event.time }
    }
    if (event.type === 'subagent/descriptor') {
      const activeSince = state.active?.since ?? state.pendingTurnStart
      return {
        descriptorSeen: true,
        settledMs: 0,
        ...(activeSince === undefined
          ? {}
          : { active: { since: activeSince, through: event.time } }),
      }
    }
    if (event.type === 'turn/end') {
      if (!state.descriptorSeen) {
        if (state.pendingTurnStart === undefined) return state
        const { pendingTurnStart: _closed, ...next } = state
        return next
      }
      if (state.active === undefined) return state
      const { active, ...rest } = state
      return {
        ...rest,
        settledMs: state.settledMs + Math.max(0, event.time - active.since),
      }
    }
    if (state.active === undefined) return state
    return { ...state, active: { ...state.active, through: event.time } }
  },
  wire: {
    view: state => ({
      settledMs: state.settledMs,
      ...(state.active === undefined ? {} : { active: state.active }),
    }),
  },
  stateVersion: 2,
}

/**
 * Identity from the last valid descriptor; absent before one, and after an invalid one.
 * @typedef {{ mode: 'one-shot', label?: string, seq: number } | { mode: 'continuable', label: string, seq: number }} SubagentDescriptorIdentity
 */

function descriptorIdentity(event) {
  let descriptor
  try {
    descriptor = foldSubagentDescriptor([event])
  } catch {
    descriptor = undefined
  }
  if (descriptor === undefined) return undefined
  return descriptor.mode === 'one-shot'
    ? {
      mode: 'one-shot',
      ...descriptor.label !== undefined ? { label: descriptor.label } : {},
      seq: event.seq,
    }
    : { mode: 'continuable', label: descriptor.label, seq: event.seq }
}

export const subagentIdentityProjectionDefinition = {
  key: 'subagent',
  init: () => ({}),
  apply: (state, event) => {
    if (event.type !== 'subagent/descriptor') return state
    const identity = descriptorIdentity(event)
    return identity === undefined ? {} : { identity }
  },
  wire: { view: state => state.identity ?? null },
  stateVersion: 2,
}
