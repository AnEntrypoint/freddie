# AGENTS.md - ui-workflow-run

Rules for this package. Client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

- `src/client/WorkflowRunPanel.js` is a webjsx custom element converted from a React hooks component: `disclosures` is an instance field, derived phase/run facts are recomputed per render, deferred collapses settle by an explicit call at the top of `#render()` before building the vdom, and content refs (blur tracking for collapse deferral) are read from the live DOM via `querySelector` after each `applyDiff` because ref callbacks are not part of webjsx's contract.
- `workflowPhaseKey` (`workflow-definition.js`): `null` (omitted field) and the empty string must yield different keys, so the key is `missing` or `value:<length>:<phase>`.
- `WorkflowRunPanel.js`: `WorkflowRunStatus` is closed and every variant is handled above; mounted phase callbacks are created from the owner map; `DisclosureRow` always renders its header before its content. The default cases in `workflow-definition.js` mirror this.
- `src/index.js` (node half) is empty; the feature is entirely browser-side.
- `src/invariant.js`: no runtime invariant; the browser plugin contributes one effect-owned Conversation Definition, keyed renderer and dictionary, and the Host tool package owns the durable workflow event invariant.
