# @freddie/freddie-client-ui-renderer

The browser Cordis plugin that mounts webjsx slot outlets. [`freddie-client-web`](../web/README.md) renders a framework-free boot page and loads the complete client plugin roster before calling `ctx.uiRenderer.mount(container)`. Mount replaces the boot nodes with the assembled application and returns its unmount disposer.

Business plugins pass observable sources through typed slot `hooks`; the renderer binds them at the outlet. It projects the selected session title and performs the context-level `renderSlot('root')` call. Cordis, webjsx, ui-slots, and ui-primitives share browser identities through the shell's static module table.

## Observable delivery

The [static ui-slots owner](../ui-slots/README.md#observable-read-tracking) holds hook, revision and read-tracker identities across renderer HMR. Detached factories can build props and DOM but do not subscribe; connection synchronously reads current state and binds subscriptions.

Hooks read snapshots synchronously. A hook called without an equality argument records an unguarded read: the outlet re-renders on every notification of that source, and an outlet skips a source callback only when it already consumed the notification revision, including a render initiated by its ancestor. A hook called with an equality argument records a guarded read: when every tracked read of a source is guarded, a notification re-runs each guarded selector against the new snapshot and re-renders only if some `equal(next, drawn)` is false, where `drawn` is the value that the last render read. A selector that throws during that check counts as changed, so the render surfaces the failure. Guarded reads are for immutable values (primitives, replaced arrays, replaced objects); a selector that returns a mutable handle must stay unguarded, or its in-place changes go stale. Unread provided hooks still invalidate the outlet by default, and mutable projection handles retain their notifications. A `renderSlotChain` owner that builds its fallback from its own tracked renders passes `fallbackSubscriptions: 'reads'` to drop the default provided-hook subscription for that raw fallback; the owner then re-renders the outlet by passing new fallback content, and the outlet no longer subscribes to session hooks on its own behalf.

An outlet subscribes only to tracked reads when its nonempty set of evaluated participants all explicitly opt into `'reads'` through native `webjsxSlot` or plain `functionSlot` wrappers. Participants include every evaluated chain selector, even a declined candidate. Empty, mixed or legacy compositions, an all-declined chain, and a resident raw overlay fallback retain default provided-hook subscriptions on session-scoped slots, unless a chain owner passes `fallbackSubscriptions: 'reads'`, which removes the raw fallback as a participant. A `root`-scoped slot binds no provided session hooks, because its entries never receive session props. Actual tracked sources are always subscribed under either policy; registry, locale, provider, revision ordering and lifecycle delivery remain unchanged. See the [decision](../../../.agents/notes/implemented/architecture/2026-10-06-composer-read-tracked-subscriptions.md).

Adapted subscribers share one underlying subscription per source. Connected outlets supply their current DOM depth so ancestors receive source callbacks before descendants, independent of connection or HMR registration order. Fan-out remains synchronous and reaches every adapted subscriber before propagating subscriber errors. A single error retains its identity; multiple errors become an `AggregateError`. Reentrant outlet renders complete after the active render in the same call. Disconnect removes subscriptions; reconnect reads current state and binds them again.

Connected outlets retain registry, locale and session-provider subscriptions while their binding identities remain unchanged. Registry identity includes the host and slot key; locale and provider identity use the actual source, not the cached host. Each retained binding calls its latest render callback. Source or key replacement releases the previous subscription, and disconnect clears all bindings. Binding reuse never skips a prop application, render or source notification.

## Model Experience

None, as the UI renderer only assembles browser UI and contributes no model-visible input.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **The first application frame waits for every client entry** — the boot kernel hands over the mount point only after the loader roster settles. Per-region readiness remains deferred.
- **Slot rendering has no per-entry lazy loading** — the complete plugin roster settles before the renderer mounts the root.
