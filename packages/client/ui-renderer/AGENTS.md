# client-ui-renderer

## Rationale

- `src/client/scoped-slots.js` `FreddieEntryHost#propsAssigned`: `h('freddie-entry-host', { key, tag, entryProps })` declares `tag` before `entryProps`, so webjsx assigns `tag` first. `set tag` therefore only creates the child and waits; applying props there would call the child's `setProps` with the default `EMPTY_INJECTED_PROPS` (no `useStore`/actions) before `set entryProps` runs.
- `renderOutletContent` `guarded`: each entry is wrapped in a `div` keyed by entry identity so a winner change (re-election, shadowing fallback, HMR re-registration) yields a different key and applyDiff builds a fresh subtree; webjsx reuses a node only when the key matches.
- `FreddieSlotOutlet#render` / `FreddieRootOutlet#render`: `trackReads` wraps `applyDiff` because entry elements read their hooks inside the diff (`setProps` runs from webjsx's `ref` callback); those reads feed `#bindHookSources` / `#bindReads`.
- `FreddieRootOutlet#render`: no `root` entry after the first render is a hot swap of the plugin owning `root` (empty anchor until the next registration re-renders); before any render it is a boot-order bug and throws `SlotAssemblyError`.
- `src/client/index.js` `mount`: the render waits for the first `root` registration instead of throwing. After a `connection` rebuild the renderer can re-activate before `client-ui-layout` re-registers `root`; the throw left the mount fiber FAILED for good and the container emptied.
