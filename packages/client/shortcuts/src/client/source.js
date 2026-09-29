/**
 * Minimal observable source used by the shortcut service.
 *
 * The service lives in the React-free object layer, so it cannot reach for a
 * component subscription helper. Two identities stay stable, which is what the
 * renderer's `use<Name>` binding requires: the source object itself, and the
 * snapshot reference between changes (a `set` that replaces nothing publishes
 * nothing).
 */

/**
 * Create a bare observable source.
 * @param initial - first snapshot.
 * @returns source with `getSnapshot`, `subscribe`, and `set`.
 */
export function createSource(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      if (next === snapshot) return
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}
