/**
 * Client-namespace projection of the session-stats domain: a pure re-export
 * of the package's types outlet. Client code imports ONLY the client
 * namespace (repo discipline), so `./client` projects the same single-source
 * content `./types` serves to host consumers — zero duplication.
 *
 * This module is intentionally empty at runtime: it re-exported only types.
 *
 * @module @freddie/freddie-session-stats/client
 */
export {}
