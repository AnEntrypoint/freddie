# @freddie/freddie-cordis-host-runner

## Rationale

- `guard.js` `denyContext` and the ctx facade are twins of the browser half's guard (`@freddie/freddie-cordis-client-runner`, `CTX_VERBS`): the rule is "a service must never hand sandboxed code a Context", and each half tests against the Context class of its own face. The halves compile in separate programs where `Context` merges different service keys, so sharing them would move a security invariant out of the halves that enforce it. Duplication is declared with `jscpd:ignore`.
- The facade forwards verbs lazily (`ctx[verb]` read only when called); timer mixins additionally require the `timer` Service declaration before Cordis resolves them. It is not the real ctx: writes are rejected so package code cannot stash state on a throwaway object. `in` reflects the facade API plus declared services (live or not) without resolving or wrapping.
- `sandbox.js`: fresh vm contexts lack `btoa`/`atob`/`TextEncoder`/`TextDecoder` (and `Buffer`); the sandbox provides host closures over `Buffer`, never `Buffer` itself. The TypeScript-annotation heuristic in `parseErrorMessage` looks only at the offending line, so an ` as ` inside a description string does not produce a misleading remove-annotations message. A stubbed vm (browser worker) refuses `Script` itself; the compile gate's error is then the only context.
