# client-ui-renderer

## Rationale

- `src/client/scoped-slots.js` `FreddieEntryHost#propsAssigned`: `h('freddie-entry-host', { key, tag, entryProps })` declares `tag` before `entryProps`, so webjsx assigns `tag` first. `set tag` therefore only creates the child and waits; applying props there would call the child's `setProps` with the default `EMPTY_INJECTED_PROPS` (no `useStore`/actions) before `set entryProps` runs.
- `renderOutletContent` `guarded`: each entry is wrapped in a `div` keyed by entry identity so a winner change (re-election, shadowing fallback, HMR re-registration) yields a different key and applyDiff builds a fresh subtree; webjsx reuses a node only when the key matches.
- `FreddieSlotOutlet#render` / `FreddieRootOutlet#render`: `trackReads` wraps `applyDiff` because entry elements read their hooks inside the diff (`setProps` runs from webjsx's `ref` callback); those reads feed `#bindHookSources` / `#bindReads`.
- `FreddieRootOutlet#render`: no `root` entry after the first render is a hot swap of the plugin owning `root` (empty anchor until the next registration re-renders); before any render it is a boot-order bug and throws `SlotAssemblyError`.
- `src/client/index.js` `mount`: the render waits for the first `root` registration instead of throwing. After a `connection` rebuild the renderer can re-activate before `client-ui-layout` re-registers `root`; the throw left the mount fiber FAILED for good and the container emptied.

- `src/client/index.js` `mount` uses `applyDiff(container, vnode)`: webjsx has no diff state for a never-touched container, so the first call recreates every node and removes leftover children, replacing the boot kernel `[data-freddie-boot]` markup (static, stateless) with no adoption step.

- `src/client/scoped-slots.js` dispatch: a `webjsxSlot(tag)` marker (returns null, carries `WEBJSX_SLOT_TAG`) creates or reuses that custom element keyed by entry identity and drives it via `setProps`/field assignment; a bare function registrant is called with the composed props and its VNode used directly.

- Crash boundary (`guardedRender`) guards only the synchronous render call: errors from async work or custom-element lifecycle callbacks escape it. `SlotAssemblyError` is always rethrown (fail-loud misassembly); entry errors render the `data-slot-error` face.

- Session-maybe entries adopt: an incarnation born session-less adopts the first session (identity holds across undefined to first id); switching to a different session, or dropping to no session, remounts (`nextIncarnation`).

- Outlets subscribe to the current-session provide projection because a session switch triggers none of registration-version or locale; hook sources are re-bound every render since a session switch swaps every source identity.

- Stale-wrapper pruning and the diff-cache reset guard an observed webjsx desync (`__webjsx_childNodes` reporting a stale child count after a burst of re-renders) that left duplicate `[data-slot]` wrappers.

- The static ui-slots observable owner shares read tracking across renderer generations; a hook reader without a subscription is a stale-view bug (a root-scope entry reading `useSessions` never saw host-side renames).
- `subscribeObserved` shares source subscriptions and records notification revisions, not selected-value identity: the conversation node and location indexes mutate stable handles. Deduplication only skips a revision already read by the outlet; unread hooks still invalidate. Reentrant rendering drains synchronously, and subscriber errors propagate after fan-out ([delivery contract](README.md#observable-delivery)).

- `outletDepth` orders connected outlet callbacks by current ancestry because connection, reconnect and HMR can register child callbacks before their ancestors. Insertion order alone lets a child render before its ancestor refreshes the same props.
