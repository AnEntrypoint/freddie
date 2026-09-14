# @freddie/freddie-client-ui-observability

An HMR-updating selected-session observability view. Its compact header strip reports attention, realtime connection, plan, and direct-subagent state in the primary conversation flow, and a sibling notice in the same utilities slot shows each hot reload for about four seconds — host plugin reloads (or a deferred/failed pass), client plugin swaps, stylesheet swaps and shell remounts — read from the `freddie:hmr` window event the client-hmr driver dispatches per journal row; its BLUF overview leads to focused GM, workflow, subagent, terminal, and trajectory sections. Durable facts use host-computed session projections; terminal activity uses the client runtime's mux-fed owner-scoped mirror. Workflow runs and subagent lineage retain their detailed conversation locations.

## Model Experience

None. This browser package adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- Terminal sessions and bounded output remain process-local. A browser reconnect restores only currently-live terminal snapshots; durable terminal tool records remain in the conversation log.
