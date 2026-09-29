export function SpillLocator(locator) {
  return locator
}

/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * SpillLocator is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 * @typedef {object} SpillOwner
 * @property {import('@freddie/freddie-session/types').SessionId} sessionId - the producing session's id.
 */

/**
 * Tool and call that produced one spilled artifact — recorded by the backend for a readable
 * filename and inspection. Not interpreted for access control; purely
 * descriptive.
 * @typedef {object} SpillSource
 * @property {string} toolName - the producing tool's name.
 * @property {string} [callId] - the producing tool call, when known.
 * @property {string} label - human-readable descriptor (e.g. `stdout`) for the filename.
 */

/**
 * One request to persist text to a spill artifact.
 * @typedef {object} SaveTextSpill
 * @property {SpillOwner} owner - the producing session, for storage scoping.
 * @property {SpillSource} source - the producing tool and call, for a readable filename.
 * @property {string} suggestedName - caller-suggested filename; the backend derives a collision-free name from it, never using it verbatim.
 * @property {string} content - the full text to persist verbatim.
 */

/**
 * A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance.
 * @typedef {object} SpillRef
 * @property {ReturnType<typeof SpillLocator>} locator - opaque model-facing handle; do not parse.
 * @property {number} bytes - exact byte length of the persisted content.
 * @property {string} retrievalHint - model-facing guidance for reading this artifact back.
 */
