# Agent Note: Persisted stores validate rehydrated state against their init shape

Status: implemented

## Problem

A persisted snapshot store restored any parsed JSON value over its init state. Undeclared keys, a primitive where an object was declared, or a `null` where a string was declared all reached the store: a stored `{"selection":42,"draft":null}` kept `draft` as `null` against an init of `''`. A boolean store (`dsh.trajectory.duration`, init `false`) given `true` became `{}`, because the spread merge ran over a primitive. The persisted keys carried no version, so a changed shape read the previous one.

## Decision

`attachPersistence` rehydrates through `restoreSnapshot`. A parsed value that does not match the init shape is discarded and the init state is used. `matchesShape` compares recursively: a `null` init field accepts any value; an array init requires an array; a primitive init requires the same `typeof`; an object init requires a non-array object, rejects keys it does not declare, and checks each declared key. An empty object init is an open record, so keyed maps (`groupExpansion`, `sessionOrderByAccount`, the session's `sessionId`) accept any keys beneath them. A matching object merges over init as before; a matching primitive is restored as is.

The three unversioned persisted keys take a `.v1` suffix: `dsh.conversation.chat.v1`, `dsh.sessions.current.v1`, `dsh.trajectory.duration.v1`. `dsh.workspace.view.v5` is unchanged. Values stored under the unversioned keys are not read.

## Alternatives considered

**Strict key set at every depth.** Rejects undeclared keys at every level. An empty object init then discards `sessionId` and every keyed workspace map on each load; the candidate probe showed `dsh.sessions.current` restored as `{}` and the workspace view reset to init.

**Merge, then drop undeclared keys.** Keeps type-mismatched values, so the chat draft `null` still reaches the store.

**Migrate the unversioned data.** The pre-release stance rejects old on-disk formats; a migration path would be a compatibility shim with no current consumer.

**A schema object per store.** The init value already defines the shape; a second schema duplicates it and needs its own maintenance.

## Consequences

A stored value that no longer matches resets the store to init without a log line; only malformed JSON logs (`rehydration failed`). A `null` init field cannot reject a type, so those fields trust the stored value. Nested state below an empty object init is not validated. Saved state under the three unversioned keys is orphaned on the first load after this change. Stores that persist state under an object init must declare every key they store, or the next load resets them.
