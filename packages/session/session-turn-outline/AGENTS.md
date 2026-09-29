# AGENTS.md — session-turn-outline

## Rationale

- `turnOutlineProjectionDefinition.apply`, `turn/start`: `repeatsOrRewindsTurn` returns the same state, keeping the outline sorted; a retried turn's previews land on the standing entry.
- `turnOutlineProjectionDefinition.apply`, `user/message`: only the newest turn can still await its opening prompt; later human messages in the same turn (steering) keep the first preview (`openingPromptAlreadyCaptured`).
- `turnOutlineProjectionDefinition.apply`: uninteresting events return the same state reference and draft-only changes keep `turns` identity, so a carrier comparing view values by reference drops them. The registry's state-identity gate still pushes one frame per draft update, so a streaming turn emits a few value-identical frames before the response commits.
- `turn/start` anchors each entry because its seq is the load-through target for a jump. Previews scan at most twice the limit per block because the fold runs on every message event. Draft-only applies keep the `turns` array identity so the identity-gated change feed emits one frame per draft update. `src/types.js` and `src/client.js` are intentionally empty.
