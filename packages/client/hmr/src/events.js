/**
 * Wire protocol of the `/plugins/events` dev SSE channel — single source for
 * both halves of this package. Frames still cross a wire boundary: the
 * browser half validates them at its JSON parse point; sharing the type keeps
 * the two ends from drifting, not from parsing.
 */

/**
 * One SSE frame: the full graph on connect (`graph`), one rebuilt bundle row
 * (`rebuilt`), a stylesheet bundle rev (`css-rebuilt` — `rev`, `href`), a
 * shell source change (`shell-rebuilt` — `rev`, `root`: the static watch id
 * that moved), or a relayed host HMR journal row (`host-reloaded` — `kind`
 * reload/deferred/failed, `plugins` workspace-relative paths, `reason`).
 */

/** System SSE endpoint pushing graph/rebuilt frames (wire protocol constant). */
export const EVENTS_ENDPOINT = '/plugins/events'
