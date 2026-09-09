/**
 * Pure types of the todo domain: the ONE home of the `todos` projection-key
 * declaration plus its payload types, free of this package's host-side value
 * imports (freddie-tools, zod). Two namespace projections serve it — `./types`
 * for host consumers, `./client/types` (the browser half-entry's re-export)
 * for client aggregates — with zero content duplication.
 *
 * This module carried only compile-time-only constructs (a `TodoItem`
 * re-export and a `declare module` SessionProjectionMap augmentation) with
 * zero runtime representation. Converted to buildless JS per the pure-type
 * package rule: the type-only value is intentionally dropped, and nothing
 * runtime-visible remains in this file.
 *
 * @module @freddie/freddie-tool-todo/types
 */
export {}
