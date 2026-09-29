# AGENTS.md — workspace

## Rationale

- `index.js` `create(path, title)` (open follow-up): `title` lost its last production caller when the gateway's create-by-name branch was deleted ([note](../../../.agents/notes/implemented/simplification/2026-07-31-one-route-to-add-a-workspace.md)); drop the parameter with its `@param` clause and the `create(path, title?)` lines in this package's README pair.
- `entity.js` `attachSession`: header validation is skipped when the settled snapshot already accounts the id, since the cwd fact was checked at first attach and both inputs (stored header cwd, workspace path) are immutable. Membership itself is decided on the write chain inside `mutate`, never on this snapshot.
- `index.js` `archiveSession`: the operation-chain slot serializes against every other registry write, so its check-then-write pair cannot interleave with another archive.
- `index.js` `deleteKnown`: if the order rollback fails the durable marker still says to finish deletion, so the cache drops the entity to agree with that recoverable direction. If only clearing the marker fails after the table delete committed (and was published to Host streams), the marker is kept for startup recovery and a warning is logged instead of reporting failure for a state that became true.
- `index.js` `enqueueOperation`: pending-mutation recovery runs before every operation so a committed delete with only its marker cleanup pending is retried before another create/delete can overwrite the pending operation record.
