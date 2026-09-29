# AGENTS.md — lsp

## Rationale

- `src/index.js` `registerProvider`: validate, normalize (catching intra-provider duplicates such as `.TS` and `.ts`) and cross-provider conflict-check everything BEFORE any mutation, so an invalid or conflicting registration publishes nothing (all-or-nothing); the id and every extension are then reserved in one lifecycle controller so disposal releases them together. The `ctx.effect` disposer's promise is discarded (our disposer API is synchronous).
- `src/index.js` `finalExtension`: `dot <= 0` covers both no dot (-1) and a leading-dot dotfile (0); neither has an extension.
