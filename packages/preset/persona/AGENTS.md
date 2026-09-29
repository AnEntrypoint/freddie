# AGENTS.md — persona

## Rationale

- `src/index.js` `PERSONA_ORDER`/`PERSONA_SECTION` are imported from `@freddie/freddie-system-prompt`, never restated: the registry declares the slot this row replaces, and two copies would drift into a persona that lands beside the deployment's instead of shadowing it.
- Scope-only row: mounted globally it collides with the prompt registry's own persona registration and fails loud, which is intended. `text` is a template interpolated strictly against registered prompt variables; empty text drops the section; `complete` makes it the whole system prompt; `includeRuntimeContext` suppresses runtime-context snapshots for that agent scope.
