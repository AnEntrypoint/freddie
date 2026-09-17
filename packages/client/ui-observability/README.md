# @freddie/freddie-client-ui-observability

A selected-session operations view focused on actionable work. Its overview and GM tab combine host-computed lifecycle/checkpoint projections with direct session navigation; workflow and subagent views retain their detailed conversation locations. Terminal activity uses the client runtime's mux-fed owner-scoped mirror. Build-reload diagnostics stay outside this user-work view.

## Model Experience

None. This browser package adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- Terminal sessions and bounded output remain process-local. A browser reconnect restores only currently-live terminal snapshots; durable terminal tool records remain in the conversation log.
