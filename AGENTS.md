# AGENTS.md

Freddie is a plugin-based agent harness on the Cordis framework layer (`framework/`): **everything is a plugin**. Read [docs/architecture.md](docs/architecture.md) before changing `packages/`; documentation rules: [docs/AGENTS.md](docs/AGENTS.md).

## Pre-release stance: foundation over blast radius

**Remove this section at the first tagged release.** Prefer the correct foundation over compatibility shims; rename or repackage freely and update every reference together. Backends reject old on-disk formats: SQLite uses monotonic `SCHEMA_VERSION`; `freddie-session` keeps `SESSION_FORMAT_VERSION` at `0`, with no compatibility promise.

## Repository layout

`framework/` is the first-party Cordis layer ([divergence log](framework/README.md)). `packages/<group>/<pkg>/` holds `@freddie/freddie-*` workspaces ([package map](packages/README.md)). `native/` (landlock addon), `examples/` (runnable leaves), `.agents/` (Agent Notes), `docs/` (catalogs), `scripts/` (gates).

## Commands

`pnpm install` (node `^22.19 || >=24`); `pnpm run publint` (publish shape); `pnpm freddie --profile headless "task"`, `pnpm run demo:cordis` and `demo:acp` need `DEEPSEEK_API_KEY`. Buildless: packages ship `src/**/*.js` with no `build`, `clean` or `typecheck` step ([development.md](docs/development.md)).

### Host sandbox failures

- With approvals disabled or unrestricted filesystem access, run required commands without a sandbox-permission field; any resulting failure is ordinary command evidence.
- In a confined host, when `gh`, `pnpm` or generator commands fail on sandbox-blocked credentials, network, IPC, file watching or nested `sandbox-exec`, retry unchanged with the narrowest host escalation before diagnosing authentication or project failure.
- Require sandbox evidence; never bypass a genuine failure or the product sandbox under test.

### Verify before pushing

- No automated suite ([why](.agents/notes/implemented/architecture/2026-09-02-buildless-workspace-no-transformation-at-launch.md)): verify by exhaustive manual execution against the real running system, in the same turn and PR. Run the real code path against real state, read the real output, and re-derive the check from the request's own words. A diff's claim about itself is not evidence.
- Match evidence to the surface: live boot (`pnpm freddie` or the relevant app entry point) for behavior; `pnpm run publint` for package-shape or publish-surface drift.
- Run what the change touches; never every check for every change.

## Secrets / .env

- Real-API demos read `DEEPSEEK_API_KEY`, optional `DEEPSEEK_BASE_URL`, and root `.env`. Never commit credentials.
- `cordis.yml` allows `!!js` (never `!js`) under plugin `config` and entry `disabled`; other metadata stays literal; conditional composition uses overlays ([primer](docs/cordis-primer.md#loader-configuration)).

## Conventions

- Packages are `@freddie/freddie-<name>`; `framework/` packages take the `@freddie` scope too and publish public with the harness (`publishConfig.access: public`; [mapping](docs/rescope.md)). `@freddie/cordis` is a peer and dev dependency of every harness package.
- ESM everywhere (`"type": "module"`). Cross-package imports use package names; local relative imports use `.js`. No TypeScript, transpilation or `tsx`: `packages/*/*/src` runs under plain `node`.
- Bare `cordis.yml` plugins (raw/Web) must appear in their resolver manifest's `dependencies`; no script checks this, so boot the real config after adding one.
- **Registrations are effects**: contributions go through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer.
- **Runtime invariants assert owned relationships**: check authoritative event streams or mutable data, not service presence, metadata, effects or fixed examples. Without a plausible relationship, an explained empty companion is correct ([package rules](packages/AGENTS.md)).
- **Typed events are merge-extensible maps** (e.g. `SessionEventMap`): a new event also joins its package's runtime type set; its mode and payload contract live in the package README. Public service methods document parameters and returns in the package README.
- A `SessionEventMap` member is required-on-read by default; builds without its type refuse the log unless the event carries `ignorable: true`. Only structural format changes bump `SESSION_FORMAT_VERSION` ([mechanism](.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md)).
- **Switch on discriminant tags.** Closed unions end in `assertNever`; merge-extensible unions fall through a documented default.
- **Waterfall listeners MUST call `next()`**, or the chain short-circuits ([semantics](docs/cordis-primer.md#cordis-waterfall-semantics)).
- **Model-visible ⟺ logged**: anything reaching a model request is reconstructable from the session log; a new model-visible input requires a session event.
- **Plugins, not loop changes**: new behavior uses documented extension points; changing `agent-loop` requires updating [docs/architecture.md](docs/architecture.md).
- **A capability seam is complete**: Service Definition, Service Provider and Consumer roles together, never one role; split only when roles evolve independently ([glossary](docs/glossary.md#capability-seam)).
- **Prefer maintained dependencies** when they delete owned code ([policy](.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)).
- **Explicit > implicit at package boundaries**: `resolve(request): Spec` in the owner, never a hidden `?? default` inside `run()`.
- **No hardcoded tunables in plugins**: deployment-varying choices are `Config` fields; protocol, spec and security constants stay fixed.
- **Misconfiguration fails loud** at load when self-contained, otherwise at the earliest resolvable point; never silently skip a missing referent.
- **Opaque cross-boundary ids are branded** (`Branded<B>` from `freddie-brand`), never bare `string`.
- **Trust the documented contract at same-process boundaries**: add no runtime validation, fallback or hostile-input tests solely for values a same-process package contract documents. Validate at parser/config, queued, model/tool JSON, durable/file, worker, process and wire boundaries.
- **An empty `catch` names what it swallows** and why nothing else can reach it; keep the `try` to one statement.
- Do not comment on facts obvious from code.
- **Prefer symmetry for parallel values**; unexplained asymmetry usually signals a missed extraction.
- **Non-trivial changes MUST include an Agent Note in the same PR**; only mechanical or local edits are exempt ([scope](.agents/notes/README.md#when-to-write-one)). Archived notes are frozen: never edit them or treat them as current authority ([archive policy](.agents/notes/README.md#archiving-and-deletion)).
- **A tool's UI render intent is part of its design** (`generic`/`terminal`/`diff`, `locations`); presenters are pure in `args` ([cookbook](docs/cookbook/adding-a-tool.md)).
- **The SDK projects the loop.** Agent-loop, session-lifecycle and `SessionEventMap` changes update `packages/sdk`'s (`protocol`/`client`/`server`) expected outputs in the same PR, verified by a live SDK run against the changed loop. This checkout has no `python/` SDK.
- **Choose PR history deliberately.** Split independent changes; fix the introducing PR before propagation. Standalone PRs and official stacks may merge-forward or rebase after review. Rewrites use `--force-with-lease`, abort on remote movement, never raw `--force`; an in-progress merge-forward preserves its checkpoint before taking a newer base ([rationale](.agents/notes/implemented/process/2026-08-02-native-github-stacks-and-optional-rebases.md)).
- **Labels:** one `kind/*` per PR, all material `area/*`, native Issue Type ([taxonomy](.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md)).
- TODO markers: `FIXME`/`TODO`/`XXX` by urgency ([semantics](docs/development.md)).
- Files end with exactly one trailing newline; the pre-commit `git diff --cached --check` gates it.

## Defensive patterns

Before lifecycle, concurrency, subprocess or teardown work, read [docs/defensive-patterns.md](docs/defensive-patterns.md).

## Documentation

Source carries no comments; non-obvious contracts live in package READMEs and AGENTS.md. Prose, budgets and placement: [docs/AGENTS.md](docs/AGENTS.md). Decisions: [freddie-prose-standard](.agents/skills/freddie-prose-standard/SKILL.md).

## Editing these instructions

`CLAUDE.md` symlinks the root, `packages/` and `examples/` AGENTS.md files: edit the real file. Keep each rule self-contained, linking high-level docs; condense when clarity survives. Raise a ceiling in [`scripts/doc-budgets.manifest.json`](scripts/doc-budgets.manifest.json) only when content genuinely needs the space. No script enforces ceilings: recount words after editing.

## Framework layer

`framework/` is first-party: edit it like `packages/`. Record surprising departures in [framework/README.md](framework/README.md) and verify live ([verification](#verify-before-pushing)).

## Boot packages (`packages/boot`)

- Profile module resolution: the freddie installation first, then the profile directory; in-box bundles never come from a profile-local copy. `$FREDDIE_HOME/profiles/node_modules` is a flat symlink fallback covering the full dependency closure.
- `installFailLoud`: write the diagnostic before awaiting `release`; keep the handler and the timeout timer live during release, so a wedged disposer delays but never cancels `exit(1)`, and late rejections cannot kill the process mid-teardown.
- `.env` files may not set bootstrap-only names (process, runtime, VCS, network); both files are checked before either is applied.
- `cmdline` detects commander errors structurally, never with `instanceof`. `--help` and errors never run the action, so an action must reject before it publishes.
- Config-editor writes the profile patch layer under the profile file lock (shared with `freddie plugin`), holds HMR reloads for the transaction, and restores the previous document if apply rejects. Write `disabled: false` explicitly so profiles can re-enable a bundle's disabled row.
- Each package's `invariant.js` declares no runtime invariant: contracts are IO/lifecycle effects proven by running against a real profile.
