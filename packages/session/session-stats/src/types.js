/**
 * Pure types of the session-stats domain: the ONE home of the `sessionStats`
 * projection-key declaration, free of this package's host-side value imports
 * (cordis context, zod, the llm chunk predicate). Two namespace projections
 * serve it — `./types` for host consumers, `./client` for client aggregates —
 * with zero content duplication.
 *
 * This module is intentionally empty at runtime: it carried only the
 * `SessionStatsProjection` interface and a `SessionProjectionMap` declaration
 * merge, both compile-time-only constructs with no JS representation.
 *
 * @module @freddie/freddie-session-stats/types
 */
export {}
