# runtime-diagnostics/ — runtime observation of a live Host

Packages that observe a running freddie Host for a human or for the Host's own consistency checks, rather than for the model. Nothing here assembles prompts, messages, schemas, streams, or tool results. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`invariants/`](invariants/README.md) | Configurable registry service for package-owned runtime invariant checks | `ctx.invariants` |
| [`inspector/`](inspector/README.md) | Opt-in, loopback-only Chrome DevTools target over the Host realm: Console evaluation, Sources and breakpoints, redacted `fetch` capture, and the Context/Fiber tree in Elements | `ctx.inspector` |

`invariants` is the programmatic seam: most workspace packages publish a `./invariant` companion that registers their npm name and, where the package owns an observable event or mutable-data relationship, checks it. `inspector` is the interactive seam: one CDP endpoint a human points DevTools at, whose entire protocol state lives in a worker thread.

The inspector is the only package in the repository that exposes remote code evaluation. It binds loopback with no config field that widens the bind, is disabled unless a composition sets `enabled: true`, and redacts captured credentials; see its [security posture](inspector/README.md#security-posture) before mounting it.

The subsystem reference: none yet.
