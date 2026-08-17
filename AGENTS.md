# Freddie — Agent Guide

Instructions for AI coding assistants working on Freddie. Present-tense rules only — history lives in `git log` and `CHANGELOG.md`.

## Substrate (do not reimplement)

**Status:** freddie depends on `@earendil-works/pi-ai` and `@earendil-works/pi-tui` only. `@earendil-works/pi-coding-agent` and `@earendil-works/pi-agent-core` are **not installed** — `AgentSession`, `SessionManager`, `SettingsManager`, `DefaultResourceLoader`, `ModelRuntime`, `runPrintMode`/`runRpcMode` are not in use anywhere in this codebase. The agent turn loop (`src/agent/machine.js`), session store (`src/sessions.js`), settings (`src/config.js`), skills loader (`src/skills/index.js`), and plugin/extension system (`src/host/*`) are freddie-original code, not thin wrappers over that package. The correct npm scope for that package is `@earendil-works/pi-coding-agent` (not `@mariozechner/pi-coding-agent`, a stale scope). Adoption tradeoffs and the compaction-module's `SessionEntry[]` shape requirement are evaluated in memory (recall "Freddie pi-coding-agent substrate adoption tradeoffs") — conclusion: no swap reduces freddie's maintenance surface, `src/agent/compress/*`'s own policy remains pragmatic.

- `@earendil-works/pi-coding-agent` (not yet a dependency) — agent + tools + interactive TUI, if adopted. Exports `AgentSession`/`createAgentSession`, `SessionManager`, `SettingsManager`, `DefaultResourceLoader`, `ModelRuntime`, `defineTool`, `InteractiveMode`, `runPrintMode`, `runRpcMode`, `createEventBus`.
- `@earendil-works/pi-agent-core` (not yet a dependency) — lower-level `Agent`/`agentLoop`/`runAgentLoop`/`streamProxy`, a dependency of `pi-coding-agent` itself.
- `@earendil-works/pi-ai` — `complete`, `completeSimple`, `AssistantMessageEventStream`, `registerApiProvider`, `getModel`, `calculateCost`, `parseStreamingJson`, `isContextOverflow`. THE provider layer, actually installed and in use. `complete`/`completeSimple`/`registerApiProvider`/`getModel`/`getEnvApiKey`/`registerBuiltInApiProviders` live under the `/compat` subpath export (`@earendil-works/pi-ai/compat`), not the package root — the root export is a redesigned lower-level API (`createModels`/`createProvider`/`envApiKeyAuth`/etc). `calculateCost`/`parseStreamingJson`/`isContextOverflow`/`AssistantMessageEventStream` are at the root.
- `@earendil-works/pi-tui` — TUI primitives (Ink-equivalent), actually installed. `src/tui/index.js::launchTui()` dynamically imports it and, on a real TTY, constructs `src/tui/app.js::runTui()` directly on top of pi-tui's own `TUI`/`ProcessTerminal`/`Editor`/`Container` primitives (not `InteractiveMode` — that class lives in `pi-coding-agent`, which is not installed; freddie's TUI is a from-scratch shell built on pi-tui's lower-level building blocks). Falls back to `src/cli/interactive.js`'s plain `readline` REPL on non-TTY stdio, a pi-tui import failure, a `runTui()` throw, or (Windows only) when `process.env.TMUX` is set — see the psmux/tmux constraint below. `plugins/core/core-cli/plugin.js`'s `run` CLI command calls `launchTui()`, not `interactive()` directly — the rich TUI must stay reachable from the actual `freddie run` command, not just as a library export.
- **pi-tui's Windows raw-mode setup is incompatible with tmux/psmux panes — freddie routes around it, never forks the substrate to fix it.** `Terminal.start()` unconditionally calls `enableWindowsVTInput()` on `win32`, loading a native addon that calls the real Win32 `SetConsoleMode` API — inside a tmux/psmux pane, stdin is a pty, not a genuine Windows console handle, and this call silently breaks all keyboard input delivery (the process stays alive and unresponsive to any key including Ctrl+C). `src/tui/index.js::launchTui()` detects `process.platform === 'win32' && process.env.TMUX` and skips straight to the `interactive()` readline fallback, which has no raw-mode dependency — normal (non-tmux) terminals are unaffected. This is an upstream pi-tui defect (`enableWindowsVTInput` should detect a non-console stdin handle before calling `SetConsoleMode`); the guard is freddie's routing-around, not a fix, per "Substrate (do not reimplement)" above.
- `floosie` — `ProcessorMachine` (xstate). Use for gateway pipelines. Compose, don't fork.
- `anentrypoint-design` — webjsx + ripple-ui. **All GUI for freddie and thebird lives here.** Source lives in its own repo (`AnEntrypoint/design`), vendored as a git submodule at `./design` in this repo for easy editing; freddie's runtime code consumes it via the `github:AnEntrypoint/design` npm dep spec (default branch, no ref pin, no npm registry involved) — the submodule does not change any import path. For local SDK iteration, edit `./design`, rebuild via `node scripts/build.mjs` inside it, then push to `main` (CI commits the rebuilt `dist/`) to flow the change to every consumer. Do NOT add React.
- `acptoapi` — THE LLM SDK (see "acptoapi is THE SDK" below). Source lives in its own repo (`AnEntrypoint/acptoapi`), vendored as a git submodule at `./acptoapi` in this repo for easy editing; freddie's `package.json` pins it via `github:AnEntrypoint/acptoapi` (see Versioning below) — the submodule does not change that. Edit `./acptoapi`, then push to `main` to flow the change downstream.
- `xstate` v5 — every long-lived state machine (agent turns, gateway lifecycle, approvals).

## Dynamic stack contract

The stack is **thebird -> freddie -> acptoapi**. Each layer owns one concern:

- **acptoapi** owns all upstream LLM/provider connectivity: HTTP/SSE to OpenAI, Anthropic, Gemini, brand providers, ACP daemons, Claude CLI. Plus chain/queue/sampler/matrix.
- **freddie** owns agent-loop orchestration: tools, skills, sessions, memory. Calls *only* acptoapi for LLM access. No direct `fetch('https://api.openai.com/...')`. The prior migration-debt list here (`plugins/media/lib/vision.js`, `plugins/image_gen`, `plugins/media/lib/tts.js`, `plugins/media/lib/transcription.js`, `src/agent/adapters/codex_responses_adapter.js`, `src/imagegen/provider.js`, `src/agent/model-discovery.js`) is stale — those paths were relocated in the plugin-category-directory reorg and now correctly route through `getAcptoapiUrl()`/`acptoapi-bridge.js`. `src/agent/model-discovery.js` and `src/agent/model-matrix.js` no longer exist as separate files — both were consolidated into `src/models/discovery.js` (`listKnownProviders`, `discoverModels`, `loadMatrix`, `matrixUsable`, `MATRIX_FILE`). Six unrelated, fully dead direct-fetch adapter files (`xai_adapter.js`, `openrouter_adapter.js`, `bedrock_adapter.js`, `gemini_cloudcode_adapter.js`, `google_code_assist.js`, `google_oauth.js`) were found with zero live importers and removed rather than migrated.
- **thebird** owns browser presentation: webjsx UI, pyodide hermes shell. Talks to freddie for everything LLM-related when freddie is reachable; falls back to direct acptoapi only when there is no freddie.

Versioning: freddie pins `acptoapi` via `github:AnEntrypoint/acptoapi` (default branch, no ref pin) — `scripts/sync-upstream.mjs` runs on a daily cron + manual dispatch to regenerate the lockfile so the resolved SHA never goes stale, but no longer bumps a version range since there is none. Thebird vendors freddie via `scripts/sync-upstream.mjs` against upstream main.

**Every non-`github:`, non-`file:` dependency in `package.json` uses the literal `latest` dist-tag, not a `^`/`~` range — the policy is always-latest, not version-locked-with-occasional-bumps.** This alone does not keep day-to-day installs current: `package-lock.json` is git-tracked and committed, so a plain `npm install` still installs whatever the committed lockfile resolved last, regardless of the `latest` tag in `package.json`. The actual freshness guarantee comes from `scripts/sync-upstream.mjs` running on `sync-upstream.yml`'s daily cron with `--force-major` (major-version bumps are proposed too, not silently skipped forever — still landed via PR review, never auto-merged, since a major bump can be an API break worth a human look) and regenerating+committing the lockfile. The two mechanisms are jointly necessary: specifier choice (`latest` vs a range) controls what a *fresh* install resolves to; lockfile-refresh cadence controls how stale the *committed, day-to-day* install actually is. Neither alone is sufficient. The same daily job also runs `git submodule update --remote --merge` so the `design`/`acptoapi`/`plugsdk` submodule pointers (pinned to a commit SHA in freddie's git tree per `.gitmodules`, unlike the `github:` npm dep specs which float to default-branch HEAD at install time) track upstream `main` automatically instead of staying frozen at whatever SHA was last manually bumped.

## acptoapi is THE SDK

**Do not reimplement LLM resolution, chain fallback, sampler backoff, or matrix-aware scoring in freddie.** acptoapi is the single source of truth. `src/agent/llm_resolver.js` is a thin shim over `acptoapi.chat({model, messages, tools, queuesMap, matrixSource, onFallback, output})` that builds a comma-list model string from `[explicit, input.model, agent.model_preference, keyed buildAutoChain]` and delegates everything else.

Consume top-level acptoapi exports directly (no re-export shim, no helper module): `chat`, `stream`, `chain`, `chatChain`, `streamChain`, `fallback`, `buildAutoChain`, `resolveModel`, `parseCommaList`, `splitPrefix`, `listAllModelsAndQueues`, `resolveQueue`, `listAllQueues`, `loadMatrix`, `matrixScore`, `clearMatrixCache`, `peekStatus`, `getStatus`, `isAvailable`, `markFailed`, `markOk`, `resetAvailability`, `startSampler`, `stopSampler`, `createSampler`, `probe`, `probeModels`, `getCachedModels`, `getRunHistory`, `PROVIDER_KEYS`, `PROVIDER_DEFAULTS`.

Public surface reference: `node_modules/acptoapi/AGENTS.md` "Public API — unified chain SDK".

Acceptable freddie-side adapters:
- `model-discovery.js` — claude-cli/ACP/ollama probing breadth acptoapi doesn't cover. `listKnownProviders` merges `agent.discovered_models` keys + acptoapi `PROVIDER_KEYS` + `[claude-cli,kilo,opencode,ollama]`.
- `model-matrix.js` — MATRIX_FILE path helper + `matrixUsable` predicate. Freddie-side because the matrix file path is repo-local.
- `acptoapi-bridge.js` — HTTP daemon passthrough at `FREDDIE_LLM_URL` when reachable, for `claude/*` etc that need the OAuth-managed daemon.

Sampler funcs (`isAvailable`, `markFailed`, `markOk`, `resetAvailability`, `getStatus`, `probe`, `startSampler`, `stopSampler`, `createSampler`) come straight from `acptoapi` via `createRequire`. Backoff logic (5-step 30s->480s, createSampler factory, singleton) lives in `acptoapi/lib/sampler.js`. CJS/ESM boundary bridged via `createRequire(import.meta.url)`.

Matrix wired: shim passes `matrixSource: process.env.FREDDIE_MATRIX_URL || <repo>/.gm/model-availability.json` only for comma-list or `queue/<name>` model strings; single-shot omits to avoid leaking chain opts into upstream HTTP body.

**No runtime provider-registration API exists in acptoapi or freddie (verified against acptoapi's own `AGENTS.md`).** `PROVIDER_KEYS`/`PROVIDER_DEFAULTS` are exported from acptoapi's `lib/provider-maps.js` as a static, hand-edited list (`PROVIDER_KEYS` currently has 29 entries, `PROVIDER_DEFAULTS` 34 — the two are different, larger sets than any older "17 providers" count, and grow independently as acptoapi adds brands) — adding a new one means editing that file directly in the acptoapi repo, propagated to freddie on `npm install`, not calling a `registerProvider()`-style function at runtime. Freddie's own plugin contract (`src/host/contract.js` `PI_VERBS`) has no `provider` verb either, so a freddie plugin author has no in-tree path to add a bespoke provider — they'd have to open a PR against acptoapi directly. This is consistent with the "acptoapi is THE SDK" architecture above (provider breadth is acptoapi's job, not freddie's), but it does mean provider extensibility is edit-and-release, not runtime-pluggable, on either side. Not a defect to fix unilaterally — if a plugin-runtime provider-registration API is ever wanted, it's an acptoapi-repo design decision (a new export + a `provider` `PI_VERB` delegating to it), not something to bolt onto freddie alone.

## LLM resolver priority

1. explicit provider+key
2. acptoapi if `/v1/models` returns 200
3. `agent.model_preference` config array (ordered failover, sampler-gated)
4. `sdk.buildAutoChain()` env-key scan
5. throw

`PROVIDER_KEYS` and `PROVIDER_DEFAULTS` come from acptoapi — never maintained in freddie. `sdk.chat()` returns OpenAI `{choices:[{message}]}`; `sdkChat()` adapter in llm_resolver converts to freddie's `{content, tool_calls, raw}`.

`agent.model_preference: []` in `~/.freddie/config.yaml` is an array of `{ provider, model? }` objects; `resolveCallLLM` tries each in order, skipping unavailable (sampler-gated) and marking failures with backoff.

ACP protocol detail (`acpChat`, kilo/opencode backends, `/event`-before-`/message`, max_tokens 4096 floor) — see rs-learn (recall "Freddie ACP protocol detail").

### Custom OpenAI-compatible endpoints (no `models.json` equivalent — use acptoapi's extra-providers file)

Freddie has no `~/.freddie/models.json`-style user-declared model config. To point at a custom OpenAI-compatible endpoint (local Ollama/LM Studio/vLLM, a private gateway, etc.), declare it in acptoapi's own `~/.acptoapi/extra-providers.txt` — `src/agent/llm_provider_warmup.js::warmExtraProviders()` (re-exported from `llm_resolver.js`) calls into `acptoapi/lib/extra-providers` on startup so freddie's `buildAutoChain()` env-key scan (resolver priority step 4 above) picks these up automatically, same as any other provider.

File format, one entry per record (`acptoapi/lib/extra-providers.js::parseProviderFile`): either a single tab-separated line `<baseURL>\t<apiKey>\t<model1> <model2> ...`, or two consecutive lines (`<baseURL>` then `<apiKey>`) when models aren't pre-declared (they get probed instead). Blank lines and `#`-prefixed comments are skipped. This is a flat 3-field record — no `!command`/`$ENV_VAR` interpolation, no per-model `reasoning`/`contextWindow`/`cost`/`thinkingLevelMap` metadata, and entries are probed/cached with a TTL rather than hot-reloaded on demand. If a richer schema is ever needed, it belongs in acptoapi (the single source of truth for provider config per "acptoapi is THE SDK" above), not a new freddie-local file.

**Strict-host format discovery (patched 2026-08-02, UNPUBLISHED):** acptoapi's probe detected API format by POSTing a hardcoded discovery model (`gpt-4o-mini` / `claude-3-5-haiku-latest`) and treating 404 as "no endpoint here" — which wrongly rejects strict hosts like `api.moonshot.ai` that 404 ANY unknown model id. `../acptoapi/lib/extra-providers.js` `discoverOpenAI`/`discoverAnthropic` now retry a fully-404 pass with the entry's first pre-declared model (a 404 then genuinely means "no such route"). The patched file was manually synced into freddie's `node_modules/acptoapi/lib/` for immediate effect — **it will be overwritten by the next `npm install` unless acptoapi is published and freddie's dep bumped** (`scripts/sync-upstream.mjs`). A negative probe cache entry (`~/.acptoapi/extra-probe-cache.json`, 30s negative TTL / 10min positive TTL) can also mask a fixed endpoint for one TTL window.

## Plugin architecture

Every tool, platform, memory provider, GUI route, and core subsystem is a plugin under `plugins/<name>/`. There is no `src/tools/registry.js`, `src/tools/<tool>.js`, `src/gateway/platforms/*.js`, or `src/plugins/memory/*.js` — do not reach for those paths.

Contract: `{ name, version?, surfaces: 'pi'|'gui'|'both', requires?: [...names], register(ctx) }` — defined in `src/host/contract.js`.

- PI_VERBS: `tool, env, command, cron, platform, memory, skill, context, agentExt, cli`
- GUI_VERBS: `route, page, nav, debug, api, asset`
- HOOK_NAMES: `preToolCall, postToolCall, onToolProgress, preLlmCall, postLlmCall, onSessionStart, onSessionEnd, onTurnStart, onTurnEnd, onMessageInbound, onMessageOutbound, onPreCompact, onPostCompact`
- Surface guard throws `plugin <name>: surface verb '<verb>' not allowed` at load.
- `requires` cycles throw `plugin cycle: a -> b -> a` synchronously.

Host: `src/host/host.js` — `createHost({surfaces, configStore, env})` + `discoverPlugins(roots)`. Singleton in `src/host/index.js`: `host()`, `bootHost(extraRoots, {approveCwdPlugins})`, `resetHostForTests()`. Roots walked: `<repo>/plugins` and `~/.freddie/plugins/` always, plus any `extraRoots` a consumer passes — a downstream consumer's own plugin root is ADDITIVE to freddie's full library, never a replacement for it.

**`<cwd>/.freddie/plugins/` is trust-gated, not loaded unconditionally.** That root ships WITH whatever repo freddie happens to be invoked inside — a project-local `plugin.js` is attacker-controlled the instant a user runs freddie against an untrusted checkout, since `discoverPlugins` imports and executes it with full process permissions on boot. `src/host/plugin-trust.js::checkPluginTrust()` gates that one root (never the repo-shipped or user-home roots) behind a persisted allow-list at `<FREDDIE_HOME>/trust.json`, keyed by the resolved absolute plugin-root path. Resolution order: `bootHost`'s `approveCwdPlugins` param (`true`/`false`/`null`) -> persisted decision -> interactive y/N prompt if stdin+stdout are a TTY -> `FREDDIE_TRUST_CWD_PLUGINS=1` env opt-in for non-interactive contexts -> else fail closed (skip the root entirely). `bin/freddie.js`'s `-a`/`--approve` and `--no-approve` CLI flags set `approveCwdPlugins` for the invocation, mirroring pi's own project-trust CLI surface (pi's own docs pair `-na` with `--no-approve`; freddie uses `--no-approve` long-form only since commander rejects a 2-character short flag like `-na` outright).

**The bash tool inherits `process.env` verbatim by default** (`plugins/tools/bash/handler.js`) — every provider API key is visible to any spawned command. `terminal.scrub_provider_env` (config, default `false`) opts a session into stripping known provider credential env vars (`src/auth.js::listKnownEnvVars()`, the dedup'd `ENV_OF` value set) from the subprocess env via `src/host/tool-resources.js::scrubEnv()`, for running less-trusted commands. Off by default since many legitimate commands (curl-ing a provider API directly, etc.) need the real keys.

**Plugin distribution**: `freddie plugin validate|install|remove|list|registry|search` (`plugins/plugin-validate/plugin.js`) over `src/plugins/install.js` (`installPlugin`/`removePlugin`/`listInstalledPlugins`, supporting `npm:<pkg>`, `git:<url>`, and local-path specs) and `src/plugins/install-registry.js` (`fetchRegistryIndex`/`searchRegistry`/`getRegistryUrl`/`setRegistryUrl`). No freddie-owned registry is hosted yet — the registry URL config key defaults unset and `install`/`search` against it fail with a clear message until one is configured — but the npm/git/local install path itself is real and CLI-reachable, unlike pi.dev's `pi install`/`remove`/`list`/`update` package-manager surface (`settings.json`-tracked, `pi` key in `package.json`) which freddie does not replicate.

**A consumer building a message-facing agent for an UNTRUSTED end user (a WhatsApp/Discord/SMS contact, never a developer at a terminal) must NOT enable the bare `'core'` toolset.** `core` is scoped for a CODING agent and bundles `bash`, `code_execution`, `edit`, `write`, `file_operations`, `credential_files`, `read`, `grep`, `terminal`, `cronjob`, `process_registry`, `mcp_tool`/`mcp_oauth*`, `send_message` (bypasses whatever outbound pipeline the consumer built), and more — every one of these becomes schema-visible and CALLABLE by the model on every turn using that `enabledToolsets`, reachable by whatever text the end user sent, since `bootHost` always discovers freddie's own `plugins/` regardless of the consumer's own roots. Use the `'contact-facing'`/`'field-worker'` distributions in `src/toolset_distributions.js` (`enabledToolsets: []`, no bare `core`) as the safe starting point for this class of consumer, then add the consumer's OWN registered toolset (e.g. a CRM's `case_*` tools) separately. (Found live in a downstream consumer: `enabledToolsets: ['cases','core']` exposed a real, callable `bash` handler to every inbound message from the public.)

`register(ctx)` receives `{ pi, gui, hooks, log, config, host, env }`:
- `log` — scoped JSONL with plugin name
- `config` — scoped under `plugins.<name>` (`get/set/all`)
- `host` — `{plugins(), get(name)}`

Thin shims (resolved through host, do not bypass): `src/plugins/install.js`/`install-registry.js` (npm/git/local plugin install, no `manager.js` — plugin listing goes straight through `host()`, e.g. `src/cli/plugins.js`'s `listPluginsInstalled()` calling `host().plugins()`), `src/web/server.js` (iterates `host.gui.routes.list()`), `bin/freddie.js` (iterates `host.pi.cli.list()`), `src/gateway/platforms.js` (`*Adapter$` name match), `src/agent/memory_provider.js` (host-router).

## gm-skill

`gm-skill` is loaded directly as a skill from its SKILL.md — not registered as a plugin. Resolution order: (1) `~/.claude/skills/gm-skill/SKILL.md`, (2) `node_modules/gm-cc/skills/gm-skill/SKILL.md`. All other `gm-*` platform variants (gm-cc, gm-codex, gm-cursor, gm-jetbrains, gm-kilo, gm-oc, gm-vscode, gm-zed, gm-gc, gm-copilot-cli) are DEPRECATED. `src/host/cc-integration.js::loadCcFromNodeModules` carries `CC_EXCLUDE = new Set(['gm-cc'])` so the gm-cc npm package is not auto-discovered as a cc-plugin.

## Adversarial gm/lean verification loop

Non-trivial freddie fixes are verified adversarially, not self-reported: after `gm`'s PROVE/EMIT phase produces a witnessed fix, capture the diff and spawn a fresh `Agent(subagent_type='general-purpose')` with NO exposure to the fixing session's reasoning — only the diff and the surrounding file — instructed to apply `/lean`'s `G_INDEP` gate ("verifier has not read the implementation") and attack the change rather than confirm it, defaulting to a REAL DEFECT verdict unless CONFIRMED CORRECT can be defended with a specific code citation. A REAL DEFECT verdict routes back into the SAME PRD row (still narrow scope) for an immediate fix and a second live witness, never a silent inline patch outside the PRD. This surfaces defects a single unverified pass misses: e.g. `src/agent/flow_runner_core.js`'s `_processTask` used to report `ok: true` when a task node had no outgoing edge and no END was reached (silent stall-as-success); the adversarial pass on the fix additionally caught that the fix dropped `state.results` on the new error path and that `_processDecision` had the same defect class as an uncaught `TypeError` (empty `outgoing` array), both fixed same-cycle. A single `Agent()` call already achieves the `G_INDEP` property; a `Workflow` script is only worth building when verifying many files/rows in parallel, not built speculatively ahead of that need.

**Formalized template (use this shape every time, don't re-derive):**

- **Capture the diff first, narrowly.** `git diff -- <touched files>` (never the whole working tree). For each touched file, `Read` that one file in full for context — not a merged blob of every touched file, so the verifier can tell which hunk belongs to which file. That pair — diff + per-file context — is the ENTIRE input to the verifier. Do not paste PRD rows, mutable history, or the fixing session's own reasoning; the verifier must not see why the change was made, only what it is.
- **The verifier call:**
  ```
  Agent(
    subagent_type='general-purpose',
    description='Adversarial G_INDEP review of <short change desc>',
    prompt=`You have NOT seen why this change was made and must not guess at intent charitably.
      Diff:
      <diff>
      Full file(s) for context:
      <file contents>
      Apply lean's G_INDEP gate: you have not read the implementation's reasoning, only the artifact.
      Attack this change — look for: silently swallowed error paths, dropped state/fields,
      off-by-one/empty-collection edge cases, uncaught exceptions on degenerate input,
      sibling code with the same defect class left unfixed.
      Default verdict is REAL DEFECT. Only return CONFIRMED CORRECT if you can cite the
      specific line(s) that make each attack fail. Report: verdict, and if REAL DEFECT,
      the exact file:line and failing input/state that reproduces it.`
  )
  ```
- **Routing a REAL DEFECT verdict back into gm:** never patch inline outside the PRD, and the row this routes into ALWAYS goes through PROVE/EMIT again followed by a re-run of the SAME verifier template against the new diff, regardless of which of the two paths below applies — a REAL DEFECT verdict is never discharged by adding a row alone. If the originating PRD row is still open (not yet `prd-resolve`d), re-dispatch `prd-add` with the SAME `id` (upsert-rescopes in place per gm's SPECIFY "Rows are cut..." rule) and a `subject` naming the specific defect the verifier cited. If the row was already `prd-resolve`d and deleted (or never existed — a drive-by fix outside the PRD flow), `prd-add` a FRESH row for the regression the verifier found, citing the defect — then drive that fresh row through the same fix/re-verify cycle just like the rescope path. `prd-resolve` for a row fires only once a verifier pass returns CONFIRMED CORRECT — gm's own `prd-resolve` contract (this file's SPECIFY-phase description) requires `witness_evidence` for any row, generically; this loop's specific instance of that generic requirement is: name the file/line the verifier's CONFIRMED CORRECT citation pointed at, so a later reader can tell which claim it was.
- **Multi-file diffs:** when a diff spans several files with no single natural "surrounding file," the verifier gets the diff plus every touched file individually (per the capture step above) — never a same-verdict shortcut of reviewing only a subset because the set is large.
- **Scaling to many rows:** once a gm pass has more than one EMIT diff awaiting adversarial review, this codebase's `Workflow` tool (multi-agent orchestration — see its own tool description for `pipeline()`/`parallel()` semantics) runs the same per-row diff-capture + verifier-call shape as a pipeline stage, so verification of row N doesn't block on row N-1 — not built speculatively before there's more than one row to verify in parallel.
- **If the verifier's own citation doesn't hold up** (cites a line that doesn't actually defend against the attack, or misreads the diff): treat this the same as any other unwitnessed claim — re-dispatch a second, independent verifier `Agent()` call against the same diff+file input before trusting a CONFIRMED CORRECT verdict on a contested change; do not resolve a row on a citation you can see is wrong.

## Learning: gm rs-learn is THE memory mechanism

freddie learns through **gm rs-learn**, in-process, via `src/learn/gm-learn.js`. This is the single canonical learning store; the local-SQLite store is gone and the third-party providers (`plugins/memory-*/`) are legacy opt-in only.

- `src/learn/gm-learn.js` lazy-loads gm-plugkit's wasm via the ESM `createPlugkit()` export (`gm-plugkit/plugkit-wasm-wrapper.js`), caches one instance process-wide, and exposes `memorize`/`recall`/`autoRecall`/`prune`/`projectNamespace`. Every call degrades to a no-op (never throws into a turn) when gm/wasm is absent. First call cold-loads the wasm + BAAI/bge-small-en-v1.5 embed model, so it is lazy off the hot path. The wasm resolves `.gm/rs-learn.db` from process cwd; namespace is per active project (`projectNamespace()`).
- **The learning loop (workflow):** every turn (`src/agent/machine.js`) auto-recalls salient memories for the prompt on entry (injected as a "Relevant memories (gm rs-learn)" system part) and auto-learns a deduped `Q:..A:..` salient fact on substantive, non-error completion (`autoLearnTurn`, dedupe cos>=0.92, min len 40). `src/context/engine.js` `ContextPlugins.memory` does query-aware recall over the same store.
- **The `memory` tool** (`plugins/memory/handler.js`) is the explicit manual surface over the same store: `add`->memorize, `search`->recall (score-ranked), `list`->broad recall, `forget`->prune by explicit key.
- **gm-plugkit in-process API is retired** (history in rs-learn, recall "Freddie gm-plugkit in-process API history") — superseded by the agentplug daemon backend below.
- **gm-learn backend v2 (current):** `src/learn/gm-learn.js` talks to the machine-wide **agentplug daemon** instead of hosting the wasm: embeddings via `<home>/.gm-tools/agentplug-runner(.exe) dispatch bert embed` (bge-small-en-v1.5, 384d), store in `<cwd>/.gm/gm.db` `memories` table (`namespace, text, ts, embedding F32_BLOB(384)`) with libsql's native vector index (`vector_distance_cos` recall, score = 1 − dist). Same exported API (`memorize`/`recall`/`autoRecall`/`prune`/`projectNamespace`); same no-op degradation when the daemon/binary is absent. The gm daemon's own `recall` verb currently fails `unknown_plugin` upstream (gm 0.1.1166 × runner 0.1.47 skew) — freddie's client-side vector query does not depend on it.
- Legacy migration: `node scripts/migrate-memory-to-gm.mjs [namespace]` drains old `memory_local` rows into rs-learn. `src/cli/memory_setup.js` defaults `memory.provider='gm'` (no key/config); third-party providers stay behind explicit `configureProvider`.
- **Browser / gh-pages path:** `src/learn/gm-learn.js` is environment-aware. Where `node:module` is unavailable (e.g. thebird on gh-pages) it skips the `createPlugkit()` import and instead routes memorize-fire/recall/auto-recall/prune through a host bridge: `globalThis.__GM_DISPATCH__(verb, body) -> json|Promise<json>` (the host's already-loaded in-page plugkit.wasm) and `globalThis.__GM_NAMESPACE__` (string or fn -> active-workspace namespace). gm-learn probes both lazily each call (so a cold-loading wasm is picked up once ready) and degrades to no-op when the bridge is absent. This makes freddie LEARN in-browser with no node deps.

## Multi-project workspace

Freddie supports multiple isolated projects, each with its own home directory and plugin set. Registry at `~/.freddie/projects.json` stores `{ active, projects: [{name, path, created_at}] }`. Default project (`~/.freddie`) is protected from deletion.

- `src/projects.js` — `loadRegistry()`, `listProjects()`, `getActiveProject()`, `createProject({name, projectPath})`, `deleteProject(name)`, `setActiveProject(name)`, `applyActiveProjectFromRegistry()`.
- `src/home.js::applyHomeOverride(absPath)` sets `FREDDIE_HOME` and clears cached home.
- `src/host/index.js::bootHost()` calls `applyActiveProjectFromRegistry()` before plugin discovery.
- `plugins/gui-projects/plugin.js` — `GET/POST/DELETE /api/projects`, `POST /api/projects/active`.

Isolation boundary: each project gets its own sessions DB, config.json, skills/, plugins/, cron.db, batches/, logs/, auth.json (all under `getFreddieHome()`). Plugins re-read paths per-request.

**Runtime switch caveat**: switching active project calls `resetHostForTests()` and clears caches but does NOT re-discover plugins in the running dashboard. UI alerts user to restart dashboard for plugin reload. New processes pick up active project automatically.

## GUI surface (anentrypoint-design)

All web UI for freddie + thebird lives in `anentrypoint-design`. Consumers must not duplicate components inline.

- **freddie dashboard** (`src/web/`) is minimal: `index.html` (importmap), `app.js` (~100L thin mount), `state.js` (HTTP client), `routes.js` (re-exports SDK's `FREDDIE_PAGES`), `server.js`. No inline components. No inline CSS beyond reset. Any new page goes into `anentrypoint-design`'s `FREDDIE_PAGES`, not into `app.js`.
- **thebird** consumes the same SDK. Bespoke windowing (`wm.js`, `launcher.js`, `shell.js`) and any context-menu / theme-toggle DOM should migrate into the SDK as reusable kits; do not extend them in thebird.
- Theme toggle: SDK owns the controller. Consumers import it; they do NOT reimplement localStorage + `prefers-color-scheme` listeners.

Build: `node scripts/build.mjs` in the `anentrypoint-design` repo emits `dist/247420.js` + `dist/247420.css`, committed straight to `main` by `.github/workflows/publish.yml` on every push (no npm publish step — `dist/` is tracked in git specifically so jsDelivr's GitHub-CDN mode can serve it). `src/web/index.html` loads the SDK live from `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.{js,css}` (no local `/vendor/` static-serve route, no offline SW precache of the SDK — `sw.js` only precaches shell HTML/app.js). To witness a local SDK edit before it lands on main, rebuild then temporarily point index.html's importmap/link at a local dev server serving your `dist/` output. Node-side imports (`state.js`, `routes.js`, `app.js`'s SSR/page-html helpers) resolve `anentrypoint-design` through `node_modules` from the `github:AnEntrypoint/design` dependency spec in package.json (no ref suffix = default branch HEAD at install time, never an npm registry version).

### Kit consumption strategy (fleet-wide)

One strategy across every consumer of `anentrypoint-design`, all tracking GitHub directly — no npm registry involved anywhere in this chain:

- **Node-resolved consumers** (freddie, casey) declare the dependency as `github:AnEntrypoint/design` -- no ref suffix, so npm resolves the default branch (`main`) HEAD at install time. CI must not let a committed `package-lock.json` silently keep serving a stale resolved SHA forever — regenerate the lockfile (or `npm update` the dep) on a schedule/every run so "latest" stays true across time, not just at the moment the lockfile was last regenerated.
- **Browser-delivered consumers** (zellous, spoint, thebird) load `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.{js,css}`, pinned at `@main` in every importmap and stylesheet link, with no stale vendored copy served alongside. jsDelivr's `gh/` mode serves committed repo content directly — this only works because `dist/` is tracked in git (see Build above), unlike a typical gitignored build-output convention.
- `scripts/sync-upstream.mjs` resolves each sibling dep's latest state via the GitHub API instead of `npm view`, and skips any dependency already on a `github:` spec with no ref pin.

Two consumers are deliberately excluded and must stay excluded:

- **gmsniff** vendors a kit subset and makes zero external-origin runtime fetches, because it must run air-gapped and must never become a supply-chain surface for the agent host it observes. Do not give it a runtime dependency or a CDN load.
- **agentgui** vendors the built kit locally for offline operation and a UI that does not shift when upstream publishes. Do not convert it to a live CDN load.

The tradeoff of always-latest is accepted deliberately: a `main` push can change a consumer's UI with no commit in that consumer. The two repos for which that tradeoff is unacceptable are the two exclusions above. SPA routes are `#fd-<page>` (e.g. `#fd-env`), not `#/<page>` — navigate by clicking the nav link when browser-witnessing.

GUI key/path/conversation endpoints (freddie-owned `plugins/gui-*`, consumed by the SDK pages):
- **Keys** (`plugins/gui-auth`): `GET /api/auth` (per-provider env|stored|none + masked `fingerprint`, never the raw value), `POST /api/auth {provider,key}` (stores via auth store), `DELETE /api/auth/:provider`. The SDK `env` page (labelled "keys") renders a masked-input + save/remove per provider. `GET /api/env` (`plugins/gui-env`) now reports auth-store keys too, not just `process.env`.
- **Conversations** (`plugins/gui-sessions`): `GET /api/sessions/:id` (single), `DELETE /api/sessions/:id` (purges messages + FTS), alongside the existing list/messages/search.
- **Paths** (`plugins/gui-projects`): full CRUD already (`GET/POST/DELETE /api/projects`, `POST /api/projects/active`).
- **Git** (`plugins/gui/gui-git`): `GET /api/git/{status,diff,log}`, cwd allowlisted against `listProjects()`/active project via `resolveAllowedCwd`, `execFile` never a shell string. Consumed by the SDK's `git` page (`GitStatusPanel`/`GitDiffView`).
- **Worktrees** (`plugins/gui/gui-worktree`): `GET/POST/DELETE /api/worktree`, target path confined within or alongside the project dir; `createWorktree`'s `branch` field checks out an existing branch or creates one with `-b` if it doesn't already exist. Consumed by the SDK's `WorktreeSwitcher`.

Theme attribute scoping: `class="ds-247420"` on `<html>`, `data-theme="dark|light"` on `<body>`. Putting both on the same node breaks the descendant selector and themes do not switch.

Live page rerender: `AppState.body` is cached per navigation. Live routes (e.g. `#/chat` with SSE updates) must recompute body in `rerender()`:
```js
if (AppState.hash === '#/chat') { Promise.resolve(PAGES['#/chat']()).then(b => { AppState.body = b; _mount() }); return }
```
Any future live-streaming pages (cron output, traces) need the same treatment.

Inline `<script type="module">` parse errors swallow file:line in browsers. Extract the script body to a `.js` file and `node --check` it to get the exact line.

## Layout

```
src/home.js                      # getFreddieHome, applyProfileOverride, applyHomeOverride
src/projects.js                  # Multi-project registry CRUD
src/config.js                    # loadConfig, saveConfigValue, DEFAULT_CONFIG, _config_version migrations
src/sessions.js                  # libsql + FTS5 (async API — every callsite must await)
src/auth.js                      # FileAuthStore for credentials
src/toolsets.js                  # _FREDDIE_CORE_TOOLS, getEnabledToolSchemas
src/agent/machine.js             # xstate turn machine entrypoint (runTurn/resumeTurn/invokeCompactHooks); createAgentMachine in machine_builder.js, writeTrajectory in turn_trajectory.js
src/agent/llm_resolver.js        # thin shim over acptoapi.chat (resolveCallLLM); warmExtraProviders/PROVIDER_KEYS in llm_provider_warmup.js
src/agent/events.js              # wire envelope emitTurnEvent + replay log (<FREDDIE_HOME>/wire/*.jsonl)
src/agent/live-turns.js          # live-turn registry entrypoint: subscribe/steer/cancel/approvals, re-exporting turn-registry/turn-steering/turn-approval/turn-revert.js
src/agent/acptoapi-bridge.js     # HTTP passthrough to FREDDIE_LLM_URL daemon
src/models/discovery.js          # claude-cli/ACP/ollama discovery beyond acptoapi + MATRIX_FILE path/matrixUsable predicate
src/agent/pi-bridge.js           # @earendil-works/pi-ai callLLM adapter (REPL wraps it with an acptoapi-chain fallback — bare pi-bridge hard-defaults provider=anthropic and throws when unkeyed)
src/agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js
src/commands/registry.js         # CommandDef + resolveCommand + gateway/telegram/slack views
src/commands/profile.js          # profile CRUD
src/cli/interactive.js           # readline REPL, skin-aware
src/context/engine.js            # context block builders (file, skills, memory)
src/cron/{scheduler,cron-parse}.js  # persistent cron jobs (async API)
src/batch.js                     # parallel batch runner
src/web/{server,app,state,routes,index.html}  # thin dashboard mount over SDK
src/gateway/run.js               # Gateway + hooks
src/acp/server.js                # JSON-RPC stdio
src/plugins/{install,install-registry}.js  # npm/git/local plugin install + registry search
src/agent/memory_provider.js     # host-router
src/skills/index.js              # SKILL.md loader
src/skin/engine.js               # _BUILTIN_SKINS + load/get/set
src/observability/log.js         # structured logs
src/observability/debug.js       # /debug registry
src/host/{contract,host,host_helpers,index}.js  # plugin contract + discovery + singleton
plugins/<name>/{plugin,handler}.js               # ~100 plugins: tools, platforms, memory, gui, core
skills/                          # bundled skill bundles (creative/, software-development/, ops/, data/, planning/)
website/                         # flatspace docs site: flatspace.config.mjs + theme.mjs + content/pages/*.yaml
bin/freddie.js                   # commander CLI: tools, skills, profile, skin, sessions, search, gateway, acp, run, cron, batch, dashboard, help-all + user-facing key/path/conversation verbs: auth, project, session, doctor, setup
src/cli/stdin_secret.js          # readStdinSecret — masked/piped key entry (never argv) for `auth set`
```

## Adding a tool

Tools are plugins. Create `plugins/<name>/plugin.js` + `plugins/<name>/handler.js`:

```js
// handler.js
export const _tool = {
    name: 'my_tool',
    toolset: 'core',
    schema: { name: 'my_tool', description: '…', parameters: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } },
    handler: async (args, ctx) => ({ ok: true, x: args.x }),
    checkFn: () => !!process.env.MY_KEY,
    requiresEnv: ['MY_KEY'],
}

// plugin.js
import { _tool } from './handler.js'
export default {
    name: 'my-tool',
    surfaces: 'pi',
    register({ pi }) { pi.tools.register(_tool) },
}
```

Auto-discovered on `bootHost()`. For multi-tool files export `_tool0`, `_tool1`, ….

## Adding a slash command

Add a `CommandDef` to `COMMAND_REGISTRY` in `src/commands/registry.js`:

```js
{ name: 'mycmd', description: '…', category: 'Session', aliases: ['mc'], args_hint: '[arg]' }
```

Dispatch resolves against the canonical name via `resolveCommand()`. Gateway/telegram/slack views derive automatically.

## Adding a gateway platform

Platforms are plugins. Create `plugins/platform-<name>/{plugin,handler}.js`:

```js
// handler.js — class name MUST end with `Adapter` for getPlatformAdapter() to resolve it
export class MynameAdapter extends EventEmitter {
    async start() { /* … */ }
    async stop() { /* … */ }
    async send(msg) { /* … */ }
}

// plugin.js
import * as module from './handler.js'
export default {
    name: 'platform-myname',
    surfaces: 'pi',
    register({ pi }) { pi.platforms.register({ name: 'myname', module }) },
}
```

`makePlatform('myname', opts)` in `src/gateway/platforms.js` instantiates the adapter via `*Adapter$` name match.

## User-facing CLI: keys, paths, conversations

The first-run user surface lives in `plugins/core-cli/plugin.js` (registered via `pi.cli`). Keep these terse and friendly — they are the zero-to-first-conversation path, so errors print one line, never a stack:

- **Keys** — `freddie auth list|set <provider>|rm <provider>|test [provider]|show`. `set` reads the key from stdin/masked-TTY via `src/cli/stdin_secret.js` (never argv — argv leaks to shell history/`ps`); stores through `src/auth.js` `getAuthStore()`. `list` shows env var + `[set]/[--]` + source `(env|stored|none)`. Unknown provider prints the valid list (`isKnownAuthProvider` guard), never a silent no-op. `test` reuses acptoapi `isAvailable` — does NOT reimplement provider HTTP.
- **Paths/workspaces** — `freddie project list|create <name> <path>|use <name>|rm <name>|current` over `src/projects.js`. `list` marks the active project `[*]` and shows its home path. `rm default` surfaces the projects.js guard as a friendly error. Mirrors the `gui-projects` HTTP CRUD.
- **Conversations** — `freddie session list|show <id>|rm <id>` over `src/sessions.js`. `session list` shows the auto-derived title (first user prompt). `freddie run --resume [id]` continues the most-recent (or matched) conversation: `src/cli/interactive.js` loads prior `getMessages` into `state.messages`. The REPL also has `/sessions`, `/resume <id>`, `/keys`, `/project` slash commands.
- **Onboarding** — `freddie doctor` (one-glance health: env checks via `src/cli/doctor.js` `runDoctor()` + provider keys + active project/home + saved-conversation count) and `freddie setup` (guided first-run via `src/cli/setup.js` `setupWizard`). Reuse these modules — do not reimplement.

`src/sessions.js` exposes `getSession(id)`, `deleteSession(id)` (purges messages + rebuilds the external-content `messages_fts` index), `setSessionTitle`, and auto-derives a title from the first user prompt in `appendMessage`. **All session calls are async (libsql) — every callsite must `await`** (a bare call silently rejects and the conversation is never persisted; this was the REPL history-loss bug).

## Profile-safe code

- Always `getFreddieHome()` for state paths. Never `path.join(os.homedir(), '.freddie')`.
- Always `displayFreddieHome()` for user-visible messages (returns `~/.freddie` or `~/.freddie/profiles/<name>`).
- Profile operations are HOME-anchored: `getProfilesRoot()` returns `~/.freddie/profiles` regardless of active profile.

## Cache safety

Slash commands that mutate system-prompt state default to deferred invalidation; opt-in `--now` for immediate. Mid-conversation prompt rewrites blow the cache and cost real money.

## Testing

**No automated tests. Zero. None.** All testing is manual, exhaustive debugging. There is no test framework, no test runner, no test directory, no test files, no `test` script in package.json. Every verification is done by running the actual code paths live — `exec_js` for server-side, `browser` for client-side, or direct CLI invocation: `node bin/freddie.js <verb>` or `freddie exec --prompt "..."`. Do not create test files, do not reach for jest/mocha/vitest/pytest, do not add `describe`/`it`/`test` blocks. The verification surface is the live code path exercised and witnessed through the spool dispatches.

On Windows, ensure `closeDb()` and log-stream `closeAll()` are called before exit to avoid libuv handle teardown crashes.

## Substrate gotchas

- `pi-coding-agent` ships a photon-rs wasm; install needs network.
- `pi-ai` reads provider keys via `findEnvKeys` / `getEnvApiKey`. Match its env var names (`ANTHROPIC_API_KEY`, etc.).
- libsql async-debt callsite list (sessions.js/cron/scheduler.js await requirement) — see rs-learn (recall "Freddie libsql async debt").
- Bulk-rename git grep case-sensitivity trap — see rs-learn (recall "Freddie bulk-rename gotcha").
- codeinsight secrets/SQL-injection detector false-positive shapes — see rs-learn (recall "Freddie codeinsight hardcoded-secrets/SQL-injection detectors").
- codeinsight orphan-detector reachability blind spots — see rs-learn (recall "Freddie codeinsight orphan detector misses three reachability paths").
- **freddie exec Windows invocation**: `bun run bin/freddie.js exec --prompt "..."`. Do NOT use `bun x freddie` — hangs on Windows from npm registry fetch timeouts. Args: `--prompt` (required), `--model` (default ''), `--timeout` (default 60000ms). Validated CI entry point.
- GitHub Pages CI gotchas (deploy-pages@v5 duplicate-artifact rejection, rebase-regression revert trap) — see rs-learn (recall "Freddie CI gotchas").

## Subsystem guide

| Concern | Freddie location |
|---|---|
| Agent loop | `src/agent/machine.js` (xstate, freddie-original — `pi-agent-core` not installed, see Substrate) |
| CLI entry | `bin/freddie.js` (commander) + `src/tui/index.js` (`launchTui()`, a from-scratch shell over `pi-tui` primitives on a real TTY — `pi-coding-agent`'s `InteractiveMode` is not installed, see Substrate — else `src/cli/interactive.js` readline REPL) |
| Tools | `plugins/<name>/{plugin,handler}.js` (no `src/tools/`) |
| Toolsets | `src/toolsets.js` |
| Session store | `src/sessions.js` (libsql + FTS5, async API) |
| Home + profiles | `src/home.js` |
| Multi-project registry | `src/projects.js` (isolated FREDDIE_HOME per project) |
| Structured logging | `src/observability/log.js` |
| Config | `src/config.js` |
| Commands | `src/commands/registry.js` |
| Skin engine | `src/skin/engine.js` |
| Gateway + platforms | `src/gateway/run.js` + `plugins/platform-*/` |
| ACP (JSON-RPC stdio) | `src/acp/server.js` |
| TUI | `src/tui/{index,app}.js`, from-scratch shell over `pi-tui` primitives (`pi-coding-agent` not installed, see Substrate) |
| Plugins + memory | `src/plugins/{install,install-registry}.js` + `src/agent/memory_provider.js` + `plugins/memory-*/` |
| Skills loader | `src/skills/index.js` — scans `~/.freddie/skills/`, `<cwd>/skills/`, and the Agent Skills standard global dirs `~/.claude/skills`, `~/.agents/skills` (`skillRootsByPrecedence()`), 2s-TTL cached |
| Context compressor | `src/agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js` |
| Documentation site | `website/` (flatspace + content/pages/*.yaml + theme.mjs) |
| Cron scheduler | `src/cron/{scheduler,cron-parse}.js` (async API) |
| Batch runner | `src/batch.js` |
| Execution environments | `src/tools/environments/{local,docker,ssh}.js` (modal/daytona/singularity are explicit residual) |
| Dashboard | `src/web/{server,app,state,routes,index.html}` — thin mount over `anentrypoint-design` SDK |
| Auth store | `src/auth.js` (FileAuthStore) + pi-ai key resolution |
| Context engine | `src/context/engine.js` |
| Browser tool | `plugins/web/lib/browse.js` (puppeteer-core, lazy; merged web plugin also has search/fetch) |
| LLM resolver | `src/agent/llm_resolver.js` (thin shim over `acptoapi.chat`) |
| Wire protocol | `src/agent/events.js` + `src/agent/live-turns.js` + `plugins/wire` (stdio JSON-RPC) + `plugins/gui/gui-agent` (WS) — see "Wire protocol" section |
| Bundled skills | `skills/` (5 categories) |
| Verification | Manual testing via CLI (`freddie exec`, `freddie dashboard`) |

## Cross-project Rust gotchas

rs-plugkit exec utility verbs + rs-exec timeout aliases — see rs-learn (recall "Freddie cross-project Rust gotchas").

## Plugsdk integration

- Source lives in its own repo (`AnEntrypoint/plugsdk`), vendored as a git submodule at `./plugsdk` in this repo for easy editing.
- Freddie installs plugsdk via `github:AnEntrypoint/plugsdk` (default branch, no ref pin), NOT via `file:` dep and NOT from the npm registry. (A historical `"link": true` lockfile entry that used to block `npm ci` does not reproduce in the current lockfile — confirmed clean.) The `./plugsdk` submodule does not change this — it's for editing the source and pushing to `main`, not a local dependency link.
- `src/host/contract.js` re-exports only `HookType` from plugsdk (`piAdapter`/`allowResult`/`blockResult`/`modifyResult` are not real plugsdk exports and are not referenced here) and uses `HookType` constants in `FREDDIE_TO_SDK_HOOK` mapping, alongside its own `validatePlugin`/`topoSort`/`PI_VERBS`/`GUI_VERBS`/`HOOK_NAMES`/`FREDDIE_TO_NATIVE_HOOK`/`definePlugin`/`PluginRunner`/`PluginRuntime`/`SURFACES`. `plugsdk`'s declared `exports['./dispatcher']` subpath (`package.json`) points at a file that is never built/published — do not attempt to import `plugsdk/dispatcher`.

## opencode CLI shim

Windows: use the npm install (`opencode.cmd`), not the broken bun shim; ACP daemon on 4790 — see rs-learn (recall "Freddie opencode CLI shim Windows").

## scripts/sync-upstream.mjs

`node scripts/sync-upstream.mjs [--dry-run] [pkg ...]` regenerates the lockfile resolution for the 3 `github:`-spec deps (plugsdk, acptoapi, anentrypoint-design) so each tracks its repo's current default-branch HEAD, and still bumps `gm-cc` from the npm registry (unrelated to this composed-dependency set) via `^<latest>`. Skips `file:` deps and any dep already on a `github:` spec with no ref pin. Wired into `.github/workflows/sync-upstream.yml` (daily cron + workflow_dispatch); opens a PR via `peter-evans/create-pull-request@v8` on changes.

- **npm version**: the dev environment runs npm 10.7.0 — below the 11.x line. CI workflows target Node 24, which ships npm 11.x. Do NOT run `npm install -g npm@latest` (a global system change); the gap is noted here for awareness. When the global npm is eventually updated, remove this note.

## Trajectory recorder

`src/agent/turn_trajectory.js::writeTrajectory()` writes one JSON per turn under `<FREDDIE_HOME>/trajectories/<ts>-<slug>.json` when `agent.save_trajectories=true` OR `--witness <path>` is set on `freddie exec`. Schema (`schema_version: 2`):

```
{
  schema_version: 2, ts, prompt, provider, model, skill, cwd,
  iterations, result, error, error_stack,
  state_transitions: ["PLAN"|"EXECUTE"|"VERIFY"|"COMPLETE", ...],
  tool_calls: [{name, arguments, id}],
  tool_results: [{tool_call_id, content}],
  llm_calls: [{ok, durationMs, provider, model, content_length, tool_calls_count, ts, error?, stack?}],
  llm_chunks_count, compressor_invocations, events, messages
}
```

`--witness <path>` writes a parallel JSONL stream with one event per line (`session_start`, `message`, `llm_call`, `session_end`). `runTurn({witnessPath})` is the in-code equivalent.

## Wire protocol (turn events, approvals, steering)

One typed event stream, many UIs — the kimi-cli wire-mode idea, freddie-flavored. `src/agent/events.js::emitTurnEvent(sessionId, event, data)` emits an envelope `{ v: 1, event, sessionId, ts, data }` and fans out to three sinks: the legacy `plugins/gui-events/event-bus.js` (flat `{sessionId, ...data}` payloads, unchanged for old consumers), an append-only replay log at `<FREDDIE_HOME>/wire/<sessionId>.jsonl`, and live listeners (`onTurnEvent(sessionId|'*', fn)`).

Event set (`WIRE_EVENTS`): `session.created, session.start, message.append, assistant.delta (reserved, not yet emitted — the llm_resolver path is non-streaming), tool.start, tool.end, status.update, approval.request, approval.resolved, steer.append, session.end, session.error`.

`src/agent/live-turns.js` is the control plane for in-flight turns: `runTurn`/`resumeTurn` register their actor + a shared `control` object (`{steers, approvalPolicy, approvalTimeoutMs, mutatingTools, approvedTools, lastSig, streak, classifierDenials, classifierConsecDenials, classifierEscalated, classifierCallLLM}`) keyed by sessionKey. Surfaces call `subscribeTurn` / `steerTurn` (drained as user messages at the next `tool_calls->prompting` boundary) / `cancelTurn` (root-level `INTERRUPT` — moved off `idle` so cancel works mid-turn) / `resolveApproval`.

Approvals: `agent.approval_mode` config = `off` (default, pre-existing behavior) | `mutating` (gates `agent.approval_tools`, default bash/write/edit/file_operations/code_execution/process_registry/cronjob/terminal) | `classifier` (LLM adjudicates every call not in `approvedTools` — `src/agent/approval_classifier.js`, reasoning-blind ALLOW/DENY prompt; deny feeds back `{error:'tool call denied by policy classifier', reason}`, unparseable/failed verdicts fail CLOSED to the human path, 3 consecutive / 20 total denials escalate the rest of the turn to the human; model via `agent.approval_classifier_model`, default acptoapi `cheap` chain) | `all`. (The older `agent.approval_policy` OBJECT `{yolo,afk,auto_approve}` in DEFAULT_CONFIG is a separate, pre-existing session-state bag — its `auto_approve` list seeds each turn's pre-approved tools. Do NOT write a string into it.) Gated calls pause in `executing_tools` on `approval.request`; auto-reject after `agent.approval_timeout_ms` (default 120s) only on bounded surfaces — the REPL passes Infinity (kimi 1.40's foreground reversal: a present human never gets auto-rejected); `runTurn({approvalTimeoutMs})` overrides per-turn. Rejection feeds back to the model as the tool result `{error:'tool call denied by user', feedback}`. `/yolo`/`/afk` (`plugins/core/approval_state.js`) bypass the gate; detached turns (batch/cron, no registry entry) fail open. `runTurn({approvalMode})` overrides config per-turn (REPL `/approve`). `always` approvals persist repo-root-scoped in `<FREDDIE_HOME>/approval-grants.json` (seeded into every later turn via `loadApprovalGrants(cwd)` — explicit grants outrank the classifier too). Repeat protection (kimi `KimiToolset` port): identical name+args streaks get `<system-reminder>`s at 3/5/8 and force-stop the turn at 12 (`tool_call_repeat`). Per-tool session budgets: `agent.tool_budgets: {<tool>: <max>}` — cross-turn counters in live-turns (`noteToolCall`), breach skips dispatch with `tool.end {budgetExceeded:true}` + reminder (covers varying-args burn loops the streak detector can't see). Session listings badge parked approvals: `GET /api/sessions` rows carry `needsInput`, `freddie session list` prints `[needs input]`.

Steering has TWO channels (kimi 1.31 parity): `steer` injects into the running turn (drained at the next `tool_calls->prompting` boundary); `queue` (`queueTurn`/`drainQueue` in live-turns, `queue.append` wire event) runs as a follow-up turn after completion — REPL mid-turn plain text queues (`/steer <text>` injects), gui-agent auto-drains queued follow-ups, SDK busy-send queues.

Two client surfaces consume the protocol: `freddie wire` (`plugins/wire/plugin.js` — JSON-RPC 2.0 over stdio: `initialize/prompt/steer/queue/cancel/approve/replay/status`, events as `event` notifications; stdout is frames-only, clients must skip non-`{` lines from dotenvx/boot chatter) and `plugins/gui/gui-agent` (`WS /api/agent/stream?sessionId=` with replay-then-live + prompt/steer/queue/cancel/approve inbound, plus `POST /api/sessions/:id/cancel` and `GET /api/sessions/:id/wire`; WS turns use `agent.turn_timeout_ms`, default 600s, instead of gui-chat's 120s POST cap). **The protocol's versioned spec is `docs/wire-protocol-v1.md`** (envelope, transports, event table, turn-control semantics) — update it alongside `WIRE_EVENTS`/`WIRE_VERSION` when the protocol evolves. gui-agent reconstructs prior-turn context from the wire log (`priorFromWire`) — the wire log is this surface's canonical transcript, NOT sessions.db (though turns are dual-written to sessions.db for listing/search). The dashboard's `chat` page (anentrypoint-design `pages-chat.js`) is a full wire client: client-generated session ids, replay rebuild, interleaved tool cards, `ApprovalNode` (approve/always/reject), mid-turn send = queue, stop = cancel, live `assistant.delta` accumulation; POST /api/chat remains only for its offline outbox. Verification: `node _verify-wire.mjs` (21 scripted-callLLM checks — envelope, wire log, approvals incl. timeout + unbounded, budgets, queue/steer, cancel, repeat force-stop).

REPL (`src/cli/interactive.js`) is a third wire client: live `[tool]`/`[tool done]` progress lines, inline `y/n/a` approval prompts, Ctrl-C = `cancelTurn` (INTERRUPT moved to machine root so it works mid-turn), mid-turn input = queue (`/steer <text>` injects), 600s turn timeout (was 60s), plus `/approve` (per-REPL mode override incl. classifier), `/plan` (read-only turns; hides `PLAN_DISABLED` tools), `/cancel`, `/steer`, and `!<cmd>` shell escape (kimi Ctrl-X shell mode, readline-style).

Session operations (kimi /fork /undo + D-Mail class): `freddie session fork <id> [atEventIndex]` copies the wire transcript into a new id; `freddie session undo <id>` drops the last turn (wire-log truncate at the last `session.start` + DB rebuild via shared `transcriptFromWire` in `src/agent/events.js`); `revertTurn(sessionKey, turnsBack)` (live-turns, wire `revert` method, WS `{type:'revert'}`) rewinds a RUNNING turn's context N LLM steps via the root `REVERT` machine event (truncation computed from live wire events, step journal cleared). Workspace file upload: `POST /api/sessions/:id/files` (stores under `<FREDDIE_HOME>/uploads/<sid>/`, gitignored) with paths riding the prompt frame's `attachments` — model-agnostic (agent reads with file tools). Dashboard workspace has a session picker (switch/resume any conversation, rebuilds from replay) and attach affordance.

## LLM validation witness

`.gm/llm-validation.json` is the canonical witness for provider reachability. Generated by an out-of-band validator that probes every `<PROVIDER>_API_KEY` in `process.env`, plus acp-daemon endpoints (kilo on 4780, opencode on 4790) and claude-cli subprocess. Shape:

```
{
  timestamp, env_keys: [...], targets: [{provider, source, daemonUp}],
  results: [{provider, ok, ms, excerpt, error, source}],
  sampler: [{provider, ok, failCount, nextCheckIn}],
  pass_count, total
}
```

## Model availability matrix

`scripts/build-model-availability.js` writes `.gm/model-availability.json` — a Cartesian witness of every (provider × model × mode) cell. Per-cell probe with `PER_CELL_TIMEOUT_MS` (15s default) and `MAX_MODELS_PER_PROVIDER` (5 default). Provider keys read from `.env`. Feeds acptoapi sampler: `probeDirect` and `probeAgentLoop` call `markOk`/`markFailed`; both skip when `isAvailable(provider)===false`.

Schema:

```
{
  timestamp, config:{MAX_MODELS_PER_PROVIDER, PER_CELL_TIMEOUT_MS, modes:[7]},
  daemons:{acptoapi_passthrough, freddie_v1, kilo_acp, opencode_acp, claude_cli},
  providers:[{id, key_present, discovery_error, models:[{id, discovered_via, modes:{<mode>:{ok,latency_ms,excerpt?,error?,skipped?,reason?}}, usable_in_any_mode}]}],
  sampler:[{provider, ok, failCount, nextCheckIn}],
  summary:{total_providers, total_models, usable_in_any_mode, per_mode_counts:{<mode>:{ok,fail,skipped}}}
}
```

7 modes: `direct_api`, `acptoapi_passthrough`, `freddie_v1`, `kilo_acp`, `opencode_acp`, `claude_cli`, `freddie_agent_loop`.

6 skipped-reasons: `no_api_key_for_provider`, `sampler_backoff_active`, `daemon_not_running:<PORT>`, `mode_mismatch:<detail>`, `claude_cli_not_installed`, `unknown_mode`.

Dashboard endpoints (registered in `plugins/gui-models-discover/plugin.js`):
- `GET /api/models/availability` -> full JSON (404 with `{error,hint}` if file absent)
- `GET /api/models/availability/summary` -> `{timestamp, daemons, summary}` (truncated)
- `POST /api/models/availability/rebuild` -> 202 `{ok, pid, jobId}` (spawns build; 409 if rebuild in flight)

Sampler integration: agent-loop failures feed acptoapi's per-provider backoff (5-step 30s->480s). Provider-scoped granularity only — per-(provider,model) would need an acptoapi sampler schema change.

## Website theme + YAML

- `website/theme.mjs` renders structured YAML via 247420 design vocabulary, not raw markdown. Consumes `page.hero` (heading/subheading/accent/body/badges/ctas), `page.sections[]` (rotating rail color green->purple->mascot->sun->flame->sky by section index, optional `lede` + per-item `benefit` italic), `page.examples[]` (railed link list with mono numeric ranks + an external-link marker). Falls back to `page.body` markdown for prose. Style block inlined so rail/dot/chip/btn classes work without ds-247420 SDK CSS loading first. Prefer enriching hero+sections+examples over expanding body markdown.
- **YAML colon-space trap**: in `website/content/pages/*.yaml`, any value containing `: ` outside backticks (e.g. `[linux, macos, windows]`, `requiresEnv: ['MY_KEY']` snippets) MUST be double-quoted. The parser otherwise interprets the embedded colon as a mapping and the file fails to load.
- SSR innerHTML injection beats client dispatch for site pages — emit HTML with rail/dot/chip/btn classes + inline styles so it paints before the SDK loads.

@.gm/next-step.md
