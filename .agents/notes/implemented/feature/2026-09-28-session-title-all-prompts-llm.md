# Agent Note: All-prompts LLM session-title provider

Status: implemented

## Problem

freddie already owned the whole title capability seam except for one strategy. `packages/session/session-title/src/index.js` accepts `'all-prompts'` as a legal automatic mode and schedules a revision for every eligible user message under it, but no plugin registered that cadence: `@freddie/freddie-session-title-first-prompt-llm` was the only provider on top of `@freddie/freddie-session-title-llm`'s shared policy. The docs had already caught up ahead of the code — `packages/session/README.md`, `docs/capability-seams.md`, and `docs/module-graph.md` link `session-title-all-prompts-llm`, and the generated `docs/config-catalog.md` entry read "package scaffold only, no `src/` implementation present yet" — so a session could never be retitled as it grew.

## Decision

New package `packages/session/session-title-all-prompts-llm` (`@freddie/freddie-session-title-all-prompts-llm`), ported from `deepseek-ai/deepseek-harness`'s `packages/session/session-title-all-prompts-llm/src/index.ts`. `src/index.js` is a thin registration: `registerSessionTitleLlmProvider(ctx, config, name, 'all-prompts', messages => messages)` — an identity selector over the exact message snapshot the service already collects through one fixed revision, so cadence and framing stay owned by the service and the shared LLM helper. `src/invariant.js` is the empty companion [every package owes](../../../packages/AGENTS.md): this provider delegates request and result validation and retains no mutable state of its own.

Adaptations, all forced by freddie's buildless plain-JavaScript rule or by freddie conventions upstream does not share:

- Upstream's `export type Config = SessionTitleLlmConfig` plus `export const Config: z<Config>` collapse into one `export const Config = z.object({ ... })` built from `SessionTitleLlmConfigFields`, matching `@freddie/freddie-session-title-first-prompt-llm` field for field.
- `import type { Context } from '@deepseek-ai/cordis'` and the `apply(ctx: Context, config: Config): void` annotations drop; JSDoc carries the contract.
- `@deepseek-ai/dsh-session-title-llm` → `@freddie/freddie-session-title-llm` and `@deepseek-ai/schemastery` → `@freddie/schemastery`; `package.json` follows the sibling's `main: "src/index.js"` with `exports["."]` and `./invariant` rather than upstream's `lib/` plus `lib/types/**/*.d.ts` build output.
- Upstream publishes no invariant companion. Freddie requires one per package, so `src/invariant.js` registers the manifest name under a package-specific "No runtime invariant" reason.

Not ported: `tsconfig.json`, `README.i18n.yaml`, and the localized README have no freddie counterpart, and upstream's `tests/` directory is excluded by this repository's no-test-file rule.

## Alternatives considered

**Add a cadence config field to `@freddie/freddie-session-title-first-prompt-llm` instead of a new package.** Rejected: the cadence is a property of the provider registration, not a per-session choice, and the service refuses a second registration, so a selector switch would be a configuration key that can only ever be set once at composition time. Two plugins over one shared registration helper is the shape `packages/session/session-title/src/index.js` already validates.

**Export an "all messages" selector from `@freddie/freddie-session-title-llm`.** Rejected: `registerSessionTitleLlmProvider` already takes `selectMessages` and the sibling passes its own; a shared helper would be an indirection over `messages => messages`.

**Mount the package in `packages/bundle/base/cordis.patch.yml`.** Rejected: the base bundle already mounts the first-prompt provider at row id `session-title-llm` and the service admits exactly one provider, so adding a second row would fail every boot. This package is a deployment-time substitution for that row, not an addition to it.

## Consequences

Verified live on the real stack (real `Context`, `SessionStore`, `SessionTitleService`, `LlmRuntime`, real session log, real `request/header` trigger): the plugin registers `automatic: 'all-prompts'` under id `session-title-all-prompts-llm`, and three successive prompts produce three `session/title-llm-request` events whose `messageSeqs` grow `[0]` → `[0, 4]` → `[0, 4, 7]`, each framing every message so far. The same drive under the first-prompt provider produces one request for `[0]` only — the observed delta is exactly the ported cadence and selector. A fork child (`parentSession: 'parent-1'`, seeded log) frames the inherited seq `0` together with the child's own seq `5`. `ctx.sessionTitle.refresh()` folds both live messages (`[0, 2]`) and surfaces the real `LlmRuntime` failure verbatim — `no adapter registered for provider "live-verify-provider"` — since no provider credential exists in this environment; the automatic path warns and keeps the prior fallback title, which is what the session log shows. Registering the sibling beside it fails with `session-title provider "session-title-all-prompts-llm" is already registered`, and disposing the plugin fiber releases the registry so the sibling can then register. `pnpm run publint` passes this package.

What this buys: a session title that keeps representing the whole conversation instead of freezing at the first prompt, with zero new policy surface — route, framing, byte and token budgets, timeout, and cancellation all stay owned by `@freddie/freddie-session-title-llm`. What it costs: one more provider package that a deployment must choose between, and one auxiliary model request potentially per eligible prompt.

`docs/config-catalog.md`'s generated entry still carries the stale "no `src/` implementation present yet" parenthetical. No generator for that file exists in this checkout, so the line was left for the next regeneration rather than hand-edited into generated output.
