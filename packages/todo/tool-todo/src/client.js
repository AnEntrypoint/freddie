/**
 * Client-namespace projection of the todo domain: a pure re-export of the package's
 * types outlet. Client code imports ONLY the client namespace (repo
 * discipline), so `./client` projects the same single-source content
 * `./types` serves to host consumers — zero duplication.
 *
 * `./types.js` is a pure-type module (nothing runtime-visible), so this
 * re-export is now a no-op at runtime; kept as a module for import-site
 * stability.
 *
 * @module @freddie/freddie-tool-todo/client
 */
export {}
