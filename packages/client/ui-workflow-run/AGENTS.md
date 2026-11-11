# AGENTS.md - ui-workflow-run

Rules for this package. Client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

- `workflowPhaseKey` (`workflow-definition.js`): `null` (omitted field) and the empty string must yield different keys, so the key is `missing` or `value:<length>:<phase>`.
- `src/index.js` (node half) is empty; the feature is entirely browser-side.
- `src/invariant.js`: no runtime invariant; the browser plugin contributes one effect-owned Conversation Definition, keyed renderer and dictionary, and the Host tool package owns the durable workflow event invariant.
