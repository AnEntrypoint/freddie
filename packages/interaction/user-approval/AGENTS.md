# AGENTS.md — user-approval

## Rationale

- `src/index.js` `approval:policy` system-prompt context sits after retained history (`order: 115`) so a policy switch does not rewrite the stable prompt cache prefix. A bare `assemble()` has no agent and states nothing.
- `src/index.js` request path (fail-closed): the `never` policy is decided in the service BEFORE any dispatch. A `prepend: true` listener registered after mount would sit ahead of any gate listener, so only the service's own path keeps the promise that `never` rejects regardless of registration order.
- `src/index.js` request path: the waterfall is entered through `Promise.resolve().then(...)` so a listener that throws synchronously lands in the same rejection path as an async one. A non-vocabulary answerer return normalizes to `unavailable` (never leaks into callers' closed-union switches), and a throwing answerer fails the QUESTION closed rather than the caller's tool call open. After an abort wins the race the late answer resolves a settled promise and is discarded.
- `src/invariant.js`: precommit staging stays local to each event owner so event vocabularies never move into a central helper.
