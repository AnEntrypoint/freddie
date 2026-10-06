# @freddie/freddie-client-ui-renderer

The browser Cordis plugin that mounts webjsx slot outlets. [`freddie-client-web`](../web/README.md) renders a framework-free boot page and loads the complete client plugin roster before calling `ctx.uiRenderer.mount(container)`. Mount replaces the boot nodes with the assembled application and returns its unmount disposer.

Business plugins pass observable sources through typed slot `hooks`; the renderer binds them at the outlet. It projects the selected session title and performs the context-level `renderSlot('root')` call. Cordis, webjsx, ui-slots, and ui-primitives share browser identities through the shell's static module table.

## Observable delivery

The [static ui-slots owner](../ui-slots/README.md#observable-read-tracking) holds hook, revision and read-tracker identities across renderer HMR. Detached factories can build props and DOM but do not subscribe; connection synchronously reads current state and binds subscriptions.

Hooks read snapshots synchronously; the equality argument is accepted but does not filter notifications. Each tracked render records the first notification revision of every source it reads. An outlet skips a source callback only when it already consumed that revision, including a render initiated by its ancestor. Unread provided hooks still invalidate the outlet by default. Mutable projection handles therefore retain their notifications.

An outlet subscribes only to tracked reads when its nonempty set of evaluated participants all explicitly opt into `'reads'` through native `webjsxSlot` or plain `functionSlot` wrappers. Participants include every evaluated chain selector, even a declined candidate. Empty, mixed or legacy compositions, an all-declined chain, and a resident raw overlay fallback retain default provided-hook subscriptions. Actual tracked sources are always subscribed under either policy; registry, locale, provider, revision ordering and lifecycle delivery remain unchanged. See the [decision](../../../.agents/notes/implemented/architecture/2026-10-06-composer-read-tracked-subscriptions.md).

Adapted subscribers share one underlying subscription per source. Connected outlets supply their current DOM depth so ancestors receive source callbacks before descendants, independent of connection or HMR registration order. Fan-out remains synchronous and reaches every adapted subscriber before propagating subscriber errors. A single error retains its identity; multiple errors become an `AggregateError`. Reentrant outlet renders complete after the active render in the same call. Disconnect removes subscriptions; reconnect reads current state and binds them again.

Connected outlets retain registry, locale and session-provider subscriptions while their binding identities remain unchanged. Registry identity includes the host and slot key; locale and provider identity use the actual source, not the cached host. Each retained binding calls its latest render callback. Source or key replacement releases the previous subscription, and disconnect clears all bindings. Binding reuse never skips a prop application, render or source notification.

## Model Experience

None, as the UI renderer only assembles browser UI and contributes no model-visible input.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **The first application frame waits for every client entry** — the boot kernel hands over the mount point only after the loader roster settles. Per-region readiness remains deferred.
- **Slot rendering has no per-entry lazy loading** — the complete plugin roster settles before the renderer mounts the root.
