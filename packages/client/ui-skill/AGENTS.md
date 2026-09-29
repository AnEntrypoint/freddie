# AGENTS.md — ui-skill

## Rationale

- `src/client/index.js` `notifyLexicon`: listener failures are caught and logged. Settlement notifies from an ignored promise chain (a throw would surface as an unhandled rejection), and one faulty consumer must not starve the others.
- `src/client/index.js` `source.candidates`: the user-only marker rides the candidate `description` (the menu's only secondary text). `hint` is the claim-state ghost text (`ui-conversation` `input/decorations.js`), not a badge.
- `src/client/index.js` `source.onPick`: the pick lands as plain text `/name ` and the prompt ships the same literal. Determinism is host-side: the `freddie-tool-skill` `agent/pre-step` boundary recognizes the leading `/name` and injects the rendered body for every entry point. A name shared with a host command still resolves to the command, because adjudication claims the line client-side before it becomes a prompt.
- `src/client/index.js` `agent-preset/selected` invalidation: a preset decides which skill providers an agent reads, so a switched session's cached catalog belongs to a composition it no longer runs.
