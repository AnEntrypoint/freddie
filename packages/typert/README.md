# Typert

Typert separates source analysis, runtime storage, and Loader discovery.

| Package | Role | Cordis key |
|---|---|---|
| [`registry/`](registry/README.md) | Stores runtime package reflection and schemas | `ctx.typert` |
| [`loader/`](loader/README.md) | Discovers Loader entries and registers host artifacts | consumes `ctx.loader` and `ctx.typert` |

There is **no `generator/` package and none is planned**. Freddie is buildless plain JS with no TypeScript sources and no build step, so nothing exists for a TypeScript-project analyzer to analyze. Host-face artifacts (`./typert` → `src/typert.host.js`) are **hand-owned** files each contributing package maintains itself — see `packages/gm/gm-client/src/typert.host.js`, whose header comment reads *"Hand-owned Typert host manifest"*. A generator could only emit artifacts into a `lib/` tree that freddie does not have.
