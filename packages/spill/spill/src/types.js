/**
 * Vocabulary for the spill storage Service Definition. Types only — the abstract service
 * lives in `./index.js`, implementations in sibling packages
 * (`@freddie/freddie-spill-local` first).
 *
 * @module @freddie/freddie-spill/types
 */

/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */

/**
 * Brand a string as a SpillLocator.
 *
 * @param locator The backend-produced locator string to brand.
 * @returns The branded spill locator.
 */
export function SpillLocator(locator) {
  return locator
}

/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * SpillLocator is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */

/**
 * Tool and call that produced one spilled artifact — recorded by the backend for a readable
 * filename and inspection. Not interpreted for access control; purely
 * descriptive.
 */

/** One request to persist text to a spill artifact. */

/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
