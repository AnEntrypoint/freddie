/**
 * Selector binding: turns any bare observable snapshot source into a typed
 * selector reader. Since there is no React Context / useSyncExternalStore in
 * webjsx, `bindSnapshotSelector` returns a plain selector reader — always a
 * fresh synchronous `source.getSnapshot()` read passed through `sel` — rather
 * than a subscribing Hook. Callers that need change notification subscribe to
 * `source.subscribe` directly (the outlet/custom-element's own
 * connectedCallback pattern, see Toast.tsx/CodeBlock.tsx) rather than through
 * this binding; `eq` is accepted for call-site compatibility with the prior
 * uSES-shaped signature but unused (no memoized comparison happens here —
 * every call re-reads and re-selects fresh).
 */

/**
 * Bind a bare observable source to a typed selector reader.
 * @param w - snapshot source (engine store, Session object, store instance).
 * @returns the selector reader.
 */
export function bindSnapshotSelector(w) {
  return function useSelector(sel, _eq) {
    return sel(w.getSnapshot())
  }
}
