/**
 * Fiber-state projection vocabulary for the framework-free boot page. The
 * boot chain subscribes to `internal/status` and projects the owning loader
 * entry's current state.
 * @module @freddie/freddie-client-web/src/loader-status
 */

/**
 * Value mirror of cordis's `FiberState` const enum: a const enum has no
 * runtime object to import (and esbuild-based pipelines cannot inline it
 * across modules), so these values mirror the pinned vendored definition
 * (same rationale as dsh-tool-cordis's mirror).
 */
export const FIBER_STATE = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
}

/** Label for each fiber state, keyed by member (inlining-safe — no reverse mapping). */
export const STATE_LABELS = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: 'disposed',
  [FIBER_STATE.UNLOADING]: 'unloading',
}
