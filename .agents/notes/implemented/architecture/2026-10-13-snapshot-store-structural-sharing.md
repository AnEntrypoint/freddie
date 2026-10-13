# Agent Note: snapshot store updates use copy-on-write drafts

Status: implemented

## Problem

Every `createSnapshotStore(...).update(mutator)` (and therefore every `defineStore` action, which runs once per UI event and several times per frame) cloned the whole state with `structuredClone`, compared the clone to the previous state with a full `deepEqual`, and deep-froze the result in dev builds. Cost grows with total state size, not with the touched path. Measured in Node 24 on a state with 3000 chat messages (dev freeze on, both stores in the same process):

- no-op update: 9.3 ms (old), 0.001 ms (new)
- token append to the last message: 9.4 ms (old), 0.26 ms (new)

Those costs run on the client's hot path during streaming, which is the hitch source the session was chasing.

## Decision

`update` runs the mutator against a Proxy draft tree (`produce` in `packages/client/runtime/src/client/contract/store.js`). Each draft node copies its base only when a write reaches it, and the copy propagates to ancestors. Unchanged subtrees keep their identity. A write whose value deep-equals the current value is skipped, so a no-op update returns the previous snapshot and notifies nothing. The initial state is frozen once at store creation; each produce shallow-freezes only the copies it created, and `set(next)` still deep-freezes its replacement. Production builds (`import.meta.env.MODE === 'production'`) skip freezing.

Values written into a draft are materialized at assignment (drafts unwrapped, fresh plain values frozen), so copies never hold proxies. A draft node is cached only for the key it occupies; assignment and delete drop that key's cache entry.

## Verification

Differential fuzz against the previous `structuredClone` implementation, 400 runs of 40 updates each, 1-3 mutators per update, 25 mutator kinds covering nested writes, push, splice, length truncation, sort, reverse, unshift, delete, spread-and-replace, and filter/map replacement, compared on key-order-insensitive JSON:

- content mismatches 0, errors 0, previous snapshots mutated 0, unfrozen new snapshots 0
- identity-only differences (new snapshot returned where the old store saw no content change): only net-zero multi-step sequences, for example `delete x` followed by re-adding the same value, or `unshift` followed by `splice`. Each touched path is copied, as in immer.

Live check: the web profile (`freddie web`, `http://127.0.0.1:3080`) renders the session list and conversation, sidebar toggle and tab switch update through store actions, a reload restores the persisted view store, and the console reports no errors.

## Semantic change

Shared object references inside one state are not preserved across updates. Old behaviour: an object written to two paths stayed one object, so a later write through one path was visible through the other. New behaviour: each update materializes the written value, and a later write through one path does not reach the other. A grep of `draft.x = draft.y` assignments across the client found none (exhaustive over tracked files), so no current action depends on it. Persisted state already lost shared references on JSON round-trip.

## Alternatives considered

**Why not immer?** Immer is the maintained equivalent and would delete this code, but it is not installed in the workspace. Adding it means a dependency install and a vendor-modules regeneration that the vendor generator treats as a new package. That is a separate change with its own verification.

**Why not keep structuredClone and skip only the deep compare?** The clone is the dominant cost (about 9 ms at this size), so removing the compare alone would not reach the hitch budget.

## Consequences

A future store action that writes one object into two state paths and expects them to stay in sync breaks silently; reviewers should check for that pattern. A mutator that holds a draft and writes through it after the produce has returned throws (the copies are frozen). Remaining cost per token append is one array copy and one shallow freeze of the message list (about 0.26 ms at 3000 messages); chunking long lists would remove that and is deferred.
