# @freddie/freddie-client-ui-observability

Selected-session Overview of durable orchestration state. The dock reads the host `gmProgress`, `workflow`, and `goal` projections: it summarizes the current GM checkpoint, recorded workflow runs, and durable goal lifecycle before laying out the GM PRD/mutable graph. It overlays in-flight JIT tools and compact CLI last-lines on walking nodes, and edits selected GM nodes through `ctx.remote.gm` inject callbacks. Workflow chat rows remain the chronological detail view; goal activation remains process-local and is not claimed as replayable state.

## Model Experience

None. This browser package adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- Terminal sessions and bounded output remain process-local. A browser reconnect restores only currently-live terminal snapshots; durable terminal tool records remain in the conversation log.
