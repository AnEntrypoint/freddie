# @freddie/freddie-experimental-agent-team

## Rationale

- `activity.js`: `AbortSignal` does not replay an abort that wins between the pre-check and listener registration, hence the re-check after `addEventListener`.
- `journal.js` `appendAndFlush`: team events never enter the conversation surface; the locally bound `append` drops `Session.append`'s conditional surface argument and keeps the event-key/payload correlation.
- `mailbox.js`: dispatch is registered before the root transaction is released so concurrent senders enter the target-local queue in durable mailbox order.
- `roster.js` root discovery: a direct child outside the durable roster is not a teammate. Subagent descriptors mark provider-owned workers that must not get a nested Team identity; a continuation that outlives its parent during child-first teardown is not reinterpreted as a new root Team; a host-resumed ordinary fork has no descriptor in its own suffix and is a valid new root whose inherited Team records fold out by `TeamId`.
- The root probe used by lifecycle observers and teardown discovery must not throw: malformed durable streams are surfaced by authoritative Team operations, and the probe must not veto unrelated Agent lifecycle edges.
- After a continuation accepted its first prompt it is a real child: if the checkpoint fails, keep the in-memory active edge rather than an impossible active to failed transition (restart reconciliation covers the provisioning-only durable prefix). A live child during reconciliation means creation is still completing here; its creator owns the terminal member edge.
- The `progress` promise gets a no-op catch because abort can win while the durability flush is pending; the later-awaited rejection stays handled without changing its result.
- `SendTeamMessageResult.status` `queued` defers delivery; callers must not resend. A task mutation is a compare-and-set on `expectedRevision`; every mutation increments `revision`. Task `writeScopes` are advisory overlap hints only. Teammate names are never reused.
