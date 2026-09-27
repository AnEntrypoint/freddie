# freddie-values

Duplicate-install-safe closed-union, lossless-JSON, deep-freeze, and weak-map-with-values helpers shared across packages with no reason to depend on each other. `assertNever` and `deepFreeze` were independently re-implemented in over a dozen packages (`@freddie/freddie-llm`, `client/runtime`, `compaction`, `settings`, session telemetry, and more); `isJsonValue`/`snapshotJsonValue` existed byte-identically in both `@freddie/freddie-llm`'s dependency graph and `@freddie/freddie-session`. `@freddie/freddie-llm` and `@freddie/freddie-session` now re-export the `assertNever`/`deepFreeze`/`isJsonValue`/`snapshotJsonValue` here rather than defining their own; the other duplicates are unmigrated (see Known Limitations).

## Surface

```js
import { assertNever, deepEqualJson, deepFreeze, isJsonValue, snapshotJsonValue, WeakMapWithValues } from '@freddie/freddie-values'

function describe(shape) {
  switch (shape.kind) {
    case 'circle': return 'round'
    case 'square': return 'square'
    default: return assertNever(shape, 'describe')
  }
}

isJsonValue({ a: 1, b: [1, 'x', null] }) // true
isJsonValue(new Map()) // false — not lossless JSON
const detached = snapshotJsonValue({ a: { b: 1 } }) // deep copy, one read per property
deepEqualJson({ a: [1, 2] }, { a: [1, 2] }) // true
deepFreeze(request) // freezes every reachable object except AbortSignal

const owners = new WeakMapWithValues()
owners.set(session, handle)
owners.values // live Set of every currently associated handle
```

- **`assertNever(value, context?)`** always throws, with the offending value JSON-rendered (or `String()`-rendered when it isn't serializable) in the message. Use it at the default branch of a **closed** union — one that cannot gain valid unknown members from a plugin — so a new variant fails at the call site instead of silently falling through. Declaration-merged unions (session events, content blocks) must not use it; they handle known variants and fall through explicitly.
- **`isJsonValue`/`snapshotJsonValue`** validate the same lossless-JSON boundary: ordinary arrays, plain or null-prototype objects, and JSON scalars, iteratively (no call-stack depth cap), rejecting sparse, cyclic, exotic-prototype, negative-zero, and non-finite values. `snapshotJsonValue` reads each property exactly once so a stateful getter cannot change between validation and copying; `isJsonValue` runs getters but does not detach, so persistence boundaries use the snapshotter.
- **`deepEqualJson`** compares two JSON-compatible values structurally (recursive, not cycle-safe — only call it on values `isJsonValue` already accepted).
- **`deepFreeze`** freezes an object graph in place iteratively, guarding cycles, while deliberately leaving live `AbortSignal` objects mutable because freezing one breaks its consumer's ability to observe abort.
- **`WeakMapWithValues`** is a weak-key lookup whose associated values are also available as a strongly retained, live `Set` (`.values`) — for the common case of "look up by key, but also enumerate every currently-associated value." Each value belongs to at most one key; setting a key to a new value drops the old value from the set. The container performs no automatic cleanup — owners `delete`/`clear` at lifecycle end.

## Model Experience

None directly — this is a pure library. Indirectly, `deepFreeze` is what keeps LLM request/config objects immutable after they are built (`@freddie/freddie-llm` re-exports it for that purpose), and `isJsonValue`/`snapshotJsonValue` are what keeps session log events model-visible-only when they losslessly round-trip.

#### KV Cache effect

None; nothing here itself enters a request prefix.

## Known Limitations and Deferred Work

- **Most existing duplicates are not yet migrated.** Only `@freddie/freddie-llm` (`assertNever`, `deepFreeze`) and `@freddie/freddie-session` (`isJsonValue`, `snapshotJsonValue`) delegate here. `client/runtime`, `compaction-basic`, `compaction-tool-result-pruner`, `settings`, `settings-file`, `session-title`, `token-meter`, and several UI packages still carry independent `assertNever`/`deepFreeze`/`deepEqualJson` copies; each is a separate, individually-verified follow-up (different packages sit at different points in the dependency graph — `settings` in particular loads before most of it, and `client/runtime` ships to the browser).
- **`deepEqualJson` is recursive, not iterative** — unlike the other traversal helpers here, a pathologically deep JSON value could exhaust the call stack. Ported as-is from the upstream primitive this matches; make it iterative if a caller needs unbounded depth.
