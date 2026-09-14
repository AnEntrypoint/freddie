# @freddie/freddie-client-ui-observability

An HMR-updating selected-session observability view. Its compact header strip reports attention, realtime connection, plan, and direct-subagent state in the primary conversation flow; its BLUF overview leads to focused GM, workflow, subagent, terminal, and trajectory sections. Durable facts use host-computed session projections; terminal activity uses the client runtime's mux-fed owner-scoped mirror. Workflow runs and subagent lineage retain their detailed conversation locations.

## Model Experience

None. This browser package adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- Terminal sessions and bounded output remain process-local. A browser reconnect restores only currently-live terminal snapshots; durable terminal tool records remain in the conversation log.
