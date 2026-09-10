# AGENTS.md

Freddie is a plugin-based agent harness built on our own Cordis framework layer (`framework/`): **everything is a plugin**. Read [docs/architecture.md](docs/architecture.md) before changing `packages/`; follow [docs/AGENTS.md](docs/AGENTS.md) for documentation.

## Pre-release stance: foundation over blast radius

**Remove this section at the first tagged release.** With no external consumers, prefer the correct foundation over compatibility shims: rename or repackage freely and update every reference together. Backends reject old on-disk formats. SQLite uses monotonic `SCHEMA_VERSION`; `freddie-session` keeps `SESSION_FORMAT_VERSION` at `0` with no compatibility promise.

## Repository layout

`framework/` is the first-party Cordis layer ([divergence log](framework/README.md)). `packages/` holds `@freddie/freddie-*` workspaces grouped under `packages/<group>/<pkg>/` ([package map](packages/README.md)). `native/`, `examples/`, `.agents/`, `docs/`, and `scripts/` keep the landlock addon, runnable leaves, Agent Notes, catalogs, and gates.

## Commands

`pnpm install` (node `^22.19 || >=24`). `pnpm run publint` for publish-shape. `pnpm freddie --profile headless "task"` and `pnpm run demo:cordis` / `demo:acp` need `DEEPSEEK_API_KEY`. The workspace is buildless: packages ship `src/**/*.js` with no `build`/`clean`/`typecheck` step. Details: [development.md](docs/development.md).

### Host sandbox failures

When required `gh`, `pnpm`, or generator commands fail because the agent sandbox blocks credentials, network, IPC, file watching, or nested `sandbox-exec`, retry unchanged with the narrowest host escalation before diagnosing authentication or project failure. Require sandbox evidence; never bypass a genuine failure or the product sandbox under test.

### Verify before pushing

This repo has no automated test suite: verification is exhaustive manual execution against the real running system, same turn as the work — run the actual code path against real state and read the real output, re-derived from the request's own words each time. A diff's own claim about itself is not evidence.

- Match evidence to the surface: a live boot (`pnpm freddie`, or the relevant app entry point) for behavior changes, `pnpm run publint` for package-shape/publish-surface drift.
- Never default to re-running every check for every change — run what the change actually touches.

## Secrets / .env

Real-API demos read `DEEPSEEK_API_KEY`, optional `DEEPSEEK_BASE_URL`, and root `.env`. cordis.yml allows `!!js` (never `!js`) under plugin `config` and entry `disabled`; other metadata stays literal, so conditional composition also uses overlays ([primer](docs/cordis-primer.md#loader-configuration)). Never commit credentials.

## Conventions

- Every npm package is `@freddie/freddie-<name>`; `framework/` packages carry the `@freddie` scope too ([mapping](docs/rescope.md)) and publish alongside the harness (`publishConfig.access: public`), which is why the scope matters — under the original names that publication would squat them. `@freddie/cordis` is a peerDependency (+ dev) of every harness package.
- ESM everywhere (`"type": "module"`). Use package names across packages and `.js` in local relative imports — the workspace is buildless plain JavaScript; `packages/*/*/src` runs directly under plain `node`, no build step, no TypeScript, no `tsx`. Raw/Web `cordis.yml` bare plugins must appear in their resolver manifest's `dependencies`; `verify-cordis-config` enforces it.
- **Registrations are effects**: every contribution goes through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer.
- **Runtime invariants assert owned relationships.** Check authoritative event streams or mutable data, not service or method presence, plugin metadata or effects, or fixed pure examples. Without a plausible relationship, an explained empty companion is correct ([package invariant rules](packages/AGENTS.md)).
- **Typed events use declaration merging** and merge-extensible maps. Event JSDoc needs `@mode` and payload `@param`; scoped keys absent from payloads need `@freddieScopeScan unsupported`. Public service methods document parameters and non-void returns. A `SessionEventMap` member is required-on-read by default — builds that do not know its type refuse the log unless the event carries the envelope's `ignorable: true`; only structural format changes bump `SESSION_FORMAT_VERSION` ([mechanism](.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md)).
- **Switch on discriminant tags.** Closed unions end in `assertNever`; merge-extensible unions fall through a documented default.
- **Waterfall listeners MUST call `next()`** to delegate; returning without it short-circuits the chain ([semantics](docs/cordis-primer.md#cordis-waterfall-semantics)).
- **Model-visible ⟺ logged**: anything that reaches a model request must be reconstructable from the session log; a new model-visible input requires a session event.
- **Plugins, not loop changes**: new behavior goes on documented extension points; changing `agent-loop` requires updating docs/architecture.md.
- **A capability seam comprises Service Definition / Service Provider / Consumer roles.** It is complete, never one role; split only when roles evolve independently ([glossary](docs/glossary.md#capability-seam)).
- **Prefer maintained dependencies over hand-rolling** when they genuinely delete owned code and tests ([policy](.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)).
- **Explicit > implicit at package boundaries**: defaulting is an explicit `resolve(request): Spec` step in the owning implementation, never a hidden `?? default` inside `run()` (the `freddie-shell` request/spec split is the template).
- **No hardcoded tunables in plugins**: deployment-varying choices are validated `Config` fields changeable from cordis.yml; a `DEFAULT_*` constant or test hook is not configurability. Protocol constants, external specs, and security invariants stay fixed.
- **Misconfiguration fails loud** at load when self-contained, otherwise at the earliest resolvable point; never silently skip a missing referent.
- **Opaque cross-boundary ids are branded** (`Branded<B>` from `freddie-brand`), never bare `string`.
- **Trust TypeScript at typed same-process boundaries.** Do not add runtime validation, fallback behavior, or hostile-input tests solely for values the static interface requires; validate at parser/config, queued, model/tool JSON, durable/file, worker, process, and wire boundaries.
- **An empty `catch` names what it swallows** and why nothing else can reach it; keep the `try` to one statement.
- Do not comment on facts obvious from code.
- **Prefer symmetry for parallel values**; unexplained asymmetry usually signals a missed extraction.
- **Non-trivial changes MUST include an Agent Note in the same PR;** only mechanical/local edits are exempt ([scope](.agents/notes/README.md#when-to-write-one)). Archived notes are frozen: never edit or treat them as current authority ([archive policy](.agents/notes/README.md#archiving-and-deletion)).
- **Verification policy.** This repo has no automated test suite ([why](.agents/notes/implemented/architecture/2026-09-02-buildless-workspace-no-transformation-at-launch.md)). Every non-trivial model- or product-user-visible behavior change is verified live — boot the real example or app, drive the actual change, and read the real output — in the same PR; a diff's own claim about itself is never evidence.
- **A tool's UI render intent is part of its design**, decided up front (`generic`/`terminal`/`diff`, `locations`); presentation methods are pure functions of `args` ([cookbook](docs/cookbook/adding-a-tool.md)).
- **Both SDKs project the loop.** Agent-loop, session-lifecycle, and `SessionEventMap` changes update the TypeScript and Python SDK expected outputs in the same PR, verified by a live run of each SDK against the changed loop.
- **Choose PR history deliberately.** Split independent changes; fix the introducing PR before propagation. Standalone PRs and official stacks may merge-forward or rebase after review. Rewrites use `--force-with-lease`, abort on remote movement, never raw `--force`; an in-progress merge-forward preserves its checkpoint before taking a newer base ([rationale](.agents/notes/implemented/process/2026-08-02-native-github-stacks-and-optional-rebases.md)).
- **Labels:** one PR `kind/*`, all material `area/*`, and native Issue Type ([taxonomy](.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md)).
- TODO markers: `FIXME`/`TODO`/`XXX` by urgency ([semantics](docs/development.md)).
- Files end with exactly one trailing newline; `git diff --cached --check` (pre-commit) gates it.

## Defensive patterns

Read [docs/defensive-patterns.md](docs/defensive-patterns.md) before lifecycle, concurrency, subprocess, or teardown work.

## Documentation

Every module and export has concise JSDoc for its non-obvious contract. Heritage-declared members, plugin-protocol slots, and constructors keep their docs at the declaring Service Definition, protocol, or class.

Comments and docs state complete contracts and context, not reasoning transcripts. Use direct, concrete terms. Do not use metaphors. Before writing `contract`, `boundary`, or `shape`, ask whether a more exact term names the subject: write `response fields`, `JSON validation`, or `ESM exports` instead of `response shape`, `validation boundary`, or `module shape`. Keep `contract` for preconditions, postconditions, invariants, compatibility promises, and other obligations that callers, callees, implementers, providers, producers, or consumers rely on. Keep a literal process, wire, security, transaction, or lifecycle boundary. Do not narrate control flow or tests, preserve review history, or restate code. Keep behavior, failure, timing, ownership, and safe-use facts; link the rationale. Use [freddie-prose-standard](.agents/skills/freddie-prose-standard/SKILL.md) for decisions. Wire mechanically checkable invariants into an executed top-level gate and prove each changed acceptance path rejects an invalid case. Use narrow, justified exceptions instead of disabling a rule globally.

Docs accompany every code change: update affected README and JSDoc contracts together. Current-state prose, one physical line per paragraph, one home per fact, and word budgets live in [docs/AGENTS.md](docs/AGENTS.md).

## Editing these instructions

`CLAUDE.md` symlinks `AGENTS.md` at root, `packages/`, and `examples/`; edit the real file. Keep each rule self-contained while linking high-level docs. Condense when clarity survives; raise a `verify-doc-budgets` ceiling when the required content genuinely needs more space.

## Framework layer

`framework/` packages are ours, not third-party copies. Edit them directly, like any package under `packages/` — there is no upstream to sync from and no sync procedure to follow. They descend from Cordis and friends, but every one was rewritten to plain JS and carries this project's own lifecycle, config-reconciliation, and watching behavior; [framework/README.md](framework/README.md) records each divergence and why. Record a new one there when the code's shape would otherwise be surprising, and verify live per the [verification policy](#verify-before-pushing) above.
