/**
 * Browser-safe background-job domain contract. The registry's live records
 * never cross the wire; a view is the subset a human list needs, minted fresh
 * per push.
 *
 * The wire projection of one registry job record, as built by `api-proxy.js`'s
 * `jobViews()`: registry-internal fields (live handles, cancellation, etc.)
 * are dropped and only this browser-safe subset crosses the wire.
 * @typedef {object} JobView
 * @property {string} id
 * @property {string} kind
 * @property {string} label
 * @property {string} status
 * @property {*} [detail]
 * @property {number} startedAt
 * @property {number} [finishedAt]
 * @module @freddie/freddie-host-apiproxy/api/jobs
 */
