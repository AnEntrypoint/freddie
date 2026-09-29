# AGENTS.md — ui-observability

## Rationale

- `src/invariant.js` installs nothing. No runtime invariant: the host entry `src/index.js` registers nothing, and the browser half contributes one `conversation.view` slot entry that projects the host `gmProgress`, `workflow` and `goal` projections and forwards edits to the `gm` Remote; it owns no durable state and emits no cordis event.
