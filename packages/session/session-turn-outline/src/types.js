/**
 * Pure types of the turn-outline domain: the ONE home of the `turnOutline`
 * projection-key declaration, free of this package's host-side value imports
 * (the projection definition). Two namespace projections serve it — `./types`
 * for host consumers, `./client` for client aggregates — with zero content
 * duplication.
 *
 * This module is intentionally empty at runtime: it carried only the
 * `TurnOutlineEntry` and `TurnOutlineState` interfaces and the
 * `SessionProjectionMap` / `SessionProjectionStateMap` declaration merges, all
 * compile-time-only constructs with no JS representation.
 *
 * @module @freddie/freddie-session-turn-outline/types
 */
export {}
