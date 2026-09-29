# AGENTS.md — persona

## Rationale

- `src/index.js` `PERSONA_ORDER`/`PERSONA_SECTION` are imported from `@freddie/freddie-system-prompt`, never restated: the registry declares the slot this row replaces, and two copies would drift into a persona that lands beside the deployment's instead of shadowing it.
