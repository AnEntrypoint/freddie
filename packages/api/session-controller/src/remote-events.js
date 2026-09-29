/**
 * Session Controller events available to a Remote Event assembly. Forwarding
 * one of them to a Client requires an entry in the application's forwarded
 * Host-event allowlist (`packages/api/remotes/src/remote-events.js`).
 */

/** @type {import('./types.js').SessionControllerRemoteEvent[]} */
export const SESSION_CONTROLLER_REMOTE_EVENTS = [
  'api-session/activity',
  'api-session/added',
  'api-session/error',
  'api-session/removed',
  'api-session/status',
]
