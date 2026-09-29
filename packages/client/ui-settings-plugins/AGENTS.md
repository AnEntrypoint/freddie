# client-ui-settings-plugins

## Rationale

- `src/client/tab-store.js`: every settings-document commit refreshes the mirror and most commits change nothing this section shows, so the observable source keeps its snapshot reference until the fact moves; otherwise each unrelated save re-renders the whole card list (the observable-identity rule in `packages/client/AGENTS.md`).
