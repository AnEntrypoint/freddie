# AGENTS.md — jobs

## Rationale

- `src/index.js` `JobRegistry` constructor throws when `new.target === JobRegistry`: `abstract` erases at runtime, so a composition row naming this seam would register a `ctx.jobs` without methods and fail far from the misconfiguration.
- Registry semantics implementations must honor: registrations outlive producer and controller fibers; owner disposal cancels live work; owned-job access is fenced by owner session id (ids are predictable, so authorization not secrecy is the boundary); settlement is first-wins with completion announced last (a reporter may open a model turn synchronously); `start` refuses work while no attached controller serves the owner.
- Owner-relative delivery: listeners, observers, and controllers registered from an unscoped context serve every owner; those registered under an agent composition scope serve exactly agents composed under it.
- Visible-set observers fire after every commit that changes an owner's visible list (including the stopping transition teardown performs) and carry no delivery meaning; they are not a superset of `onJobDone`.
- `src/brand.js` is a leaf so browser-safe consumers import `JobId` without reaching `freddie-agent` types.
