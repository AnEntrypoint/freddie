# freddie-agent-default-model

## Rationale

- `src/index.js` `AgentDefaultModelConfig` constructor: the settings section's `onChange` is intentionally empty; every consumer reads through `currentSelection()`, so no registration-level fact needs rebuilding when the settings document changes.
