# @freddie/freddie-client-ui-observability

Selected-session Overview of the live GM PRD/mutable graph. The dock reads the host `gmProgress` projection, lays out one CSS-grid column per PRD, overlays in-flight JIT tools and compact CLI last-lines on walking nodes, and edits selected nodes through `ctx.remote.gm` inject callbacks. Workflow, subagent, and terminal plugins stay mounted elsewhere; this view does not duplicate their tabs or a PTY emulator.

## Model Experience

None. This browser package adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- Terminal sessions and bounded output remain process-local. A browser reconnect restores only currently-live terminal snapshots; durable terminal tool records remain in the conversation log.
