# AGENTS.md — Harness Packages

Package rules supplement the repo-wide [conventions](../AGENTS.md#conventions).

- **Plugin exports:** service packages default-export their service class; function plugins named-export `name` / `inject` / `Config` / `apply`, never a default export. Mixing forms makes the Loader discard the function plugin's namespace ([postmortem](../docs/postmortem/0001-acp-default-export-drops-inject.md)).
- **Optional services use `ctx.get(name)`.** Reserve `ctx.<name>` for declared injections: the property proxy is topology-sensitive; strict `ctx.get` reads the global service store ([postmortem](../docs/postmortem/0001-acp-default-export-drops-inject.md)).
- **Product-visible plugins are verified live**, never by a hand-built `ctx.plugin(...)` unit check: boot the real `cordis.yml` through the Loader and drive the actual behavior. Keep opt-ins out of shipped defaults.
- **Initiator-owned private chains derive, then capture.** Under `ctx.agents.withInitiator()`, recover the Agent at each orchestration entry, derive `agent.session`, and close operation-local helpers over it. Keep `Agent` and `Session` explicit at lifecycle, session-log, service, authority, worker/process, persistence and wire interfaces; never widen a leaf helper from `Session` to `Context` to hide a parameter ([rationale](../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md)).
- **One asynchronous operation has one lifecycle controller or transaction.** Separate readiness, cancellation, disposal, reservation or sentinel state only with an independent owner or settlement point; otherwise fold it, keeping rollback, callback containment and quiescence.
- **Design Service Definitions for all current Consumers.** Keep tool-schema, Loader, UI, transport and provider behavior in the Consumer or provider; no single Consumer dictates the contract ([rationale](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)). Smell: a public service method with one internal caller; pass a private capability closure (`RunCodeBridgeOptions`).
- **Require a current owner and need.** Tie each abstraction, state machine, option, defensive copy and compatibility path to a current contract or production consumer; keep behavior in its owning plugin or service.
- **Require evidence for public choices.** Configurability alone never justifies an unsupported default, public operation set, format or imported external concept; use current-consumer evidence or relevant prior art, else require an explicit value or defer.
- **Write model-facing contracts from the model's perspective:** prompts, tool schemas, results and diagnostics carry only task-relevant concepts, never UI, transport or implementation vocabulary. Pin stable text verbatim; pin dynamic behavior through snapshots or end-to-end coverage.
- **Enforce a decision in the operation that makes it.** Schema omission, prompt filtering, facades, wrappers and listener order enforce nothing a direct or alternate caller can bypass; exercise denial through the executor.
- **Publish state only at its commit point:** emit notifications and update derived state after the operation succeeds; derive caches, prompts, UI echoes, replay and query views from one authoritative source.
- **Apply bounds to the complete result** (byte, token, item, time), including wrappers and metadata. Exercise tiny and exact limits, oversized single chunks and multibyte byte limits.
- **Registry contributions prove disposal live:** dispose the fiber and observe removal.
- **Every package owns `./invariant`.** Register the manifest name; check an event/data relation, or give empty installers package-specific `No runtime invariant:` reasons. Generated companions, unexplained empties and ignored reporters are defects; no script gates them, so review each against these rules ([contract](../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.md)).

[Naming rules](../docs/cookbook/adding-a-package.md#name-the-role-that-exists):

- **Package source is buildless plain JavaScript** (`src/*.js`, ESM) runnable under plain `node`: no transformation step, no `lib/` output. `framework/*` is buildless too ([its AGENTS.md](../framework/AGENTS.md)).
- A package README changes in the same commit as the behavior it documents (config keys, defaults, error codes, wire fields). Apply [freddie-prose-standard](../.agents/skills/freddie-prose-standard/SKILL.md) and verify against code.
- Package READMEs document model, token and KV-cache effects per the [Model Experience format](../docs/cookbook/adding-a-package.md#4-write-the-package-readme).
- Durable consumer gaps and non-obvious maintainer constraints go under `## Known Limitations and Deferred Work`; ordinary cleanup stays in its TODO or Agent Note.

## Source contracts

- Source has no comments: use self-explanatory code; public contracts go in package READMEs, non-obvious maintainer facts in the nearest AGENTS.md. Preserve executable shebangs, legal notices, upstream dependency source and frozen archives.

## core/ package invariants

- `core/session/src/surface.js` is browser-safe (web bundle): no `node:` imports.
- `core/session/src/chunk-rows.js` storage rows (`text-chunks`, `reasoning-chunks`, `tool-call-chunks`) are durable encoding only: never in `Session.events` or `SessionEventMap`, slash-less tags; they losslessly pack same-block `assistant/chunk` delta runs.
- `core/agent/src/consumed-work.js`: turn/step events alone cannot tell cut-short work from no-op turns; the inbox log (`removedCount`, `outcome: canceled`) is the disambiguator.
- `core/agent-loop/src/tool-calls.js`: exclusive calls are barriers; parallel calls use a bounded rolling pool; policy and results stay model-ordered; abort records synthetic error results for skipped calls; a scheduler failure never fabricates results.
