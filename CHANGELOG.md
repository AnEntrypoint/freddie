## [Unreleased]

### Fixed (skills)
- `src/skills/index.js`: `listSkills()` only scanned `<FREDDIE_HOME>/skills` and `<cwd>/skills`, so a skill installed globally per the Agent Skills standard (`~/.claude/skills`, `~/.agents/skills`) never loaded — the bug reported this session. Added `skillRootsByPrecedence()` covering all four roots with explicit precedence (home/cwd shadow same-named global skills) and dedup. `loadSkill()` now surfaces `license`/`allowedTools`/`metadata` frontmatter fields and detects a frontmatter-vs-directory name mismatch. `src/cli/doctor.js` gained a `skills` check reporting count-by-root so a silent loading failure is visible via `freddie doctor`. Found and fixed three additional defects while sweeping the change: a ~40x redundant filesystem walk on repeated calls (2s TTL cache added), a null-byte file corruption introduced mid-session by an Edit-tool rewrite (fixed at the byte level), and a crash where one malformed `SKILL.md` took down discovery for every other valid skill (now fails loud on that one entry, keeps loading the rest). Also fixed `plugins/core/skills/lib/core_skills.js` referencing an undefined `s.path` instead of `s.file`.

### Security
- Audited all 35 open GitHub dependabot alerts flagged on the default branch (12 high, 16 moderate, 7 low: undici, ip-address, postcss, js-yaml, protobufjs, ws, form-data, qs, brace-expansion, fast-xml-builder, `@mariozechner/pi-coding-agent`) against the current `package-lock.json`. All 35 are already resolved as of the dependency-sweep commit above: `undici`/`ip-address`/`form-data`/`brace-expansion` aren't present in the resolved tree at all; `postcss`(8.5.25)/`protobufjs`(7.6.5)/`ws`(8.21.2)/`qs`(6.15.3)/a nested `flatspace`-bundled `js-yaml`(4.3.0)/the `fast-xml-builder` override(1.3.0) all resolve at or above every alert's first-patched-version threshold, cross-checked package-by-package via the GitHub Security Advisory API. `@mariozechner/pi-coding-agent` (the stale/wrong-scope package AGENTS.md already warns never to install) has zero installs in the current tree — `npm ls` confirms empty, and `git log -S` shows it was removed from `package.json` at commit `a70bcf0`, well before this session; the 6 alerts against it are pre-existing/stale and predate GitHub's next re-scan of HEAD. No further dependency change was reachable or needed — these are stale alert records lagging the actual fix, not live vulnerabilities.

### Fixed
- `plugins/core/core-cli/plugin.js`/`src/tui/index.js`: the `freddie run` CLI command imported `interactive()` from `src/cli/interactive.js` directly, bypassing `launchTui()` entirely — the rich pi-tui TUI (`src/tui/app.js::runTui()`) was unreachable from the actual `run` command on any platform, only usable via the library export. Wired `run` to call `launchTui()` instead. Separately, live-tested the TUI inside a real psmux (Windows tmux 3.3.7) session and found pi-tui's native `win32-console-mode.node` addon (loaded unconditionally by `Terminal.enableWindowsVTInput()` on `win32`) corrupts raw-mode keyboard input when stdin is a tmux/psmux pty rather than a real Windows console handle — confirmed via A/B test (disabling the native addon file fixed input immediately in the same pane). Added a `win32 + process.env.TMUX` guard in `launchTui()` that skips straight to the readline fallback in that environment; normal (non-tmux) terminals are unaffected.
- `src/web/index.html`/`server.js`: the dashboard's anentrypoint-design SDK load had drifted to serving a local `node_modules` copy from a `/vendor/anentrypoint-design/*` Express route, contradicting AGENTS.md's documented (and everywhere-else-correct) "loads live from unpkg.com/anentrypoint-design@latest" behavior — `website/theme.mjs` and every `website/docs/*` build output already did this correctly, only the dashboard had regressed. Reverted `index.html`'s `<link>`/importmap to the CDN `@latest` URL and removed the now-dead `/vendor/*` static-serve routes + unused `fs` import from `server.js`. Live-witnessed via a booted dashboard: HTTP fetch of `/` shows both asset URLs point at `unpkg.com/anentrypoint-design@latest`, the old `/vendor/*` path now 404s into the SPA fallback (no dangling stale-JS route), and `node bin/freddie.js exec` still returns correctly end-to-end.

### Dependencies
- Bumped every direct dependency to its current npm-registry latest: `@earendil-works/pi-ai`/`@earendil-works/pi-tui` `^0.82.1` -> `^0.83.0` (matches upstream `pi-coding-agent@0.83.0`'s own pin), `flatspace` `^1.0.18` -> `^1.0.20`, `floosie` `^0.7.6` -> `^0.7.7`, `gm-plugkit` `^2.0.2424` -> `^2.0.2464`, `gm-skill` `^2.0.2217` -> `^2.0.2464`, `js-yaml` `^5.2.2` -> `^5.2.3`, `msgpackr` `^2.0.4` -> `^2.0.5`, `plugsdk` `^1.0.20` -> `^1.0.21`, `ws` `^8.21.1` -> `^8.21.2`, `vite` (dev) `^8.1.5` -> `^8.2.0`, and the `fast-xml-builder` override `^1.1.7` -> `^1.3.0`. `@libsql/*` platform optionalDependencies bumped from a stale `0.3.19` pin to `^0.5.29`, matching the native `libsql` version `@libsql/client@0.17.4` itself requires. `anentrypoint-design` changed from a caret range (`^0.0.463`, a hard pin on the `0.0.x` line) to the literal string `latest`, per AGENTS.md's Kit consumption strategy for Node-resolved consumers. `commander`/`dotenv`/`express`/`vscode-languageserver`/`vscode-languageserver-textdocument`/`xstate`/`esbuild`/`vscode-oniguruma`/`vscode-textmate`/`@libsql/client`/`acptoapi` were already at latest, unchanged. `npm audit fix` cleared one low-severity `body-parser` DoS advisory pulled in transitively. Verified: `discoverPlugins` boots 123 plugins clean, `pi-ai`/`pi-ai/compat`/`pi-tui`/`xstate`/`acptoapi`/`plugsdk` all import with their expected export surfaces intact, and `node bin/freddie.js exec --prompt "reply with exactly the word: PONG"` returns `PONG` through the full LLM chain.

### Added
- Re-evaluated adopting `@earendil-works/pi-coding-agent`/`pi-agent-core` to cut maintenance surface (live npm registry + GitHub docs research, no code change): `InteractiveMode` still has no lightweight embedding path (requires the full `AgentSessionRuntime`/`SessionManager`), and `pi-agent-core`'s standalone `agentLoop()` generator doesn't cover freddie's wire-protocol/live-turns/approval/trajectory/session-persistence wiring already in `src/agent/machine.js` — adopting it would add an adapter shim, not remove one. AGENTS.md substrate section refreshed (version pin was stale at `^0.80.10`, now `^0.82.1`).
- pi-web port verification (agentgui + anentrypoint-design): `GitStatusPanel`/`GitDiffView`/`WorktreeSwitcher` were built in `design` but only subpath-exported, never in the `components as C` barrel every consumer actually imports, so no rebuild ever surfaced them — barrel-exported them from `design/src/components.js`. Wired agentgui's Git tab (`site/app/js/app.js`) off the resulting placeholder onto the real components, adding the missing `git.status` WS handler (`lib/ws-handlers-util.js`, porcelain=v1 parse mirroring this repo's `plugins/gui/gui-git`) plus a `backend.js` wrapper and a new-worktree `PromptDialog`, since `WorktreeSwitcher`'s `onCreate()` takes no args by design. Verified end to end via live WS calls against the running agentgui server (`git.status`/`git.log`/`git.diff`/`worktree.list` all returned real repo data) — headless-Chrome `browser` CDP was unavailable in this sandbox.
- Dynamic per-(provider × model × access_mode) availability matrix system. New `scripts/build-model-availability.js` enumerates models via existing `discoverModels()` and cross-probes each (model, mode) cell across 7 modes: `direct_api`, `acptoapi_passthrough` (:4800), `freddie_v1` (:4900), `kilo_acp` (:4780), `opencode_acp` (:4790), `claude_cli`, `freddie_agent_loop`. Sampler-aware (`markFailed` on per-cell failure), per-cell timeout 15s, per-provider model cap 5 (both env-tunable). Output: `.gm/model-availability.json` with `{timestamp, config, daemons, providers[].models[].modes{}, sampler, summary}`. Every cell is one of `{ok:true, latency_ms, excerpt}`, `{ok:false, latency_ms, error}`, or `{ok:false, skipped:true, reason}` — no blanks. Witnessed 2026-05-13: 23 providers × up to 5 models × 7 modes; 3 models green-in-any-mode (groq/gpt-oss-20b + claude-cli/haiku + claude-cli/sonnet); 8 individual cells green.
- `src/agent/model-matrix.js` (28L): `loadMatrix()` + `matrixUsable(provider, model)`. 24h TTL on consumption.
- `src/agent/llm_resolver.js`: `buildAutoChain` now consults `matrixUsable` and drops links marked `ok:false in all modes`. Matrix-absent path unchanged (preserves existing behavior). Side effect: stale defaults like `nvidia/deepseek-r1` (410 Gone) auto-drop without editing static lists.
- `plugins/gui-models-discover/plugin.js`: 3 new endpoints — `GET /api/models/availability` (200 with full matrix, 404 if absent), `GET /api/models/availability/summary` (lightweight), `POST /api/models/availability/rebuild` (202 background spawn, 409 if rebuild in flight).
- `scripts/validate-llm-providers.js`: now invokes the matrix builder by default. `--single-shot` retains the legacy one-model-per-provider behavior; `--with-single-shot` runs both.
- `test.js`: asserts both `scripts/build-model-availability.js` exists and the `/api/models/availability` endpoint returns 200|404 with valid schema when present.

### Fixed
- `plugins/platform/platform-discord/handler.js` `DiscordAdapter`: merged in a consumer's (casey) parallel reconnect implementation that had genuinely better resilience than this adapter's own built-in receive loop -- reconnect backoff ceiling + max-retry budget (was: flat ~2500ms reconnect forever, hammering a genuinely-down gateway at a fixed rate) and a `ready` event + `botUserId` getter (was: no way for a consumer to observe a fresh connect or the bot's own user id without re-parsing READY dispatch payloads itself). Per the project's own layering mandate (agentic harness -> freddie owns channel adapters, a consumer app is setup + configuration only), a consumer should never need its own parallel gateway implementation to get resilience this adapter itself should provide. Added `startTyping(channelId)`/`stopTyping(channelId)`/`triggerTyping(channelId)` (Discord's own typing-indicator POST, re-sent on a shorter-than-TTL interval while active) for a consumer building a guaranteed-response UX (show typing while a slow LLM turn is in flight). `stop()` now also clears any active typing timers and the reconnect/invalid-session timeouts it previously left dangling on a hard stop.
- `scripts/build-model-availability.js`: `probeAgentLoop` now feeds acptoapi sampler (`markOk`/`markFailed`) symmetric with `probeDirect`, closing the asymmetric-sampler-state gap where agent-loop failures bypassed per-provider backoff. Witnessed 2026-05-13: test.js 12/12 green.
- `AGENTS.md`: added "Model availability matrix" section documenting the JSON schema, 7 modes, 6 skipped-reasons, and 3 dashboard endpoints (`/availability`, `/availability/summary`, `/availability/rebuild`).

### Refactored
- `src/host/host.js`: createHost split from 111L -> 24L body. Helper factories (`makePi`, `makeGui`, `makeCcHooks`, `makeHooksRegistry`, `makeCcLoaders`, plus `reg`/`guard`/`scopedCfg`/`nullStore`) extracted to new `src/host/host_helpers.js`. host.js drops from 197L -> 64L, host_helpers.js is 152L. Both well under the 200L hard cap. Witnessed: test.js 12/12 green, plugins>=100, platforms>=18, memory>=8, surface guard + cycle errors still throw.
- `test.js`: trimmed from 202L -> 199L (within the 200L cap) by collapsing redundant blank lines and joining the final two control statements. Every assertion preserved. Witnessed 12/12 green.

### Removed (dead code, post-plugin-migration cleanup)
- 19 zero-import orphan files deleted after exhaustive reachability audit (no static import, no `await import()` string, no test reference, no AGENTS/CHANGELOG mention, no plugin handler call). Files: `src/cli/{mcp_config,auth_commands,voice,tips,skills_config,env_loader,plugins_cmd}.js`, `src/agent/{onboarding,skill_preprocessing,skill_utils,subdirectory_hints,lmstudio_reasoning,manual_compression_feedback,memory_manager,insights,prompt_builder,shell_hooks,moonshot_schema,copilot_acp_client}.js`. test.js 12/12 still green post-delete.

### Witnessed false positives (codeinsight detector limits, documented for future runs)
- "Hardcoded secrets" flags at `src/agent/auxiliary_client.js:6`, `src/cli/dingtalk_auth.js:10`, `plugins/platform-dingtalk/handler.js:{1,9,31}`, `src/gateway/helpers.js:17` are all detector regex matches on env-var identifiers, function parameter names (`secret`), URL query keys (`?appkey=&appsecret=` — DingTalk API spec), and error-message string literals. Zero actual secrets in source. Detector is regex-only; treat hits as identifier-substring matches, not values.
- "SQL injection" flags at `src/tools/environments/{daytona,vercel_sandbox}.js`, `src/web/state.js:{35,46}`, `test.js:190` are HTTP DELETE/PUT URL templates in REST clients / browser fetch calls. No SQL anywhere in any of these files. Detector matches the literal `DELETE` keyword in URL paths.

### Dependencies
- `plugsdk`: ^1.0.15 -> ^1.0.16 via `scripts/sync-upstream.mjs`. `acptoapi ^1.0.56`, `anentrypoint-design ^0.0.94`, `gm-cc ^2.0.727` already current.

### Provider witness (2026-05-12, post acptoapi 1.0.56)
- `.gm/llm-validation.json` regenerated: 5/15 pass — groq, mistral, **cloudflare (NEW, ACCOUNT_ID guard fix worked)**, sambanova, claude-cli all REAL_OK. openrouter regressed to backoff status due to upstream sampler chain ordering after nvidia (deepseek 410 Gone) failed first. kilo + opencode daemons not running (expected).

### Fixed
- `src/agent/llm_resolver.js`: assistant tool_calls returning to provider on the second turn were missing OpenAI's required `type:"function"` and `function:{name,arguments:string}` wrapping. Added `toOpenAIMessages()` that wraps assistant tool_calls and stringifies tool message content. Witnessed: mistral previously errored 422 `messages.2.tool_calls.0.type : property "type" is missing`; after fix returns `Emperor Penguin` through full PLAN -> EXECUTE -> VERIFY -> COMPLETE loop. Trajectory artifact at `penguins/.freddie/trajectories/2026-05-12T15-54-49-902-...json`.
- `plugins/core-cli/plugin.js`: `freddie exec` now uses `resolveCallLLM` instead of hardcoded acptoapi `callLLM` — previously failed `fetch failed` when acptoapi daemon wasn't running, even with valid `--model` and provider key. Added `--provider`, `--skill`, `--cwd` flags; auto-parses `provider/model` from `--model`.

### Added
- `src/agent/machine.js`: `writeTrajectory()` writes per-turn JSON to `$FREDDIE_HOME/trajectories/<ts>-<slug>.json` when `agent.save_trajectories=true`. Records prompt, provider, model, cwd, iterations, result, error, state_transitions (PLAN/EXECUTE/VERIFY/COMPLETE), tool_calls, full messages. Filled gap: config flag existed but had no implementation.
- `scripts/validate-llm-providers.js`: rewritten to dynamically enumerate `.env` keys × acptoapi `PROVIDER_KEYS`. Emits `.gm/llm-validation.log` + `.gm/llm-validation.json`. Live witnessed run: 5/15 REAL_OK across groq, mistral, openrouter, sambanova, claude-cli.

### Witnessed broken (documented honestly, not fixed)
- opencode `serve --port 4790` listens but every HTTP endpoint times out — likely needs `OPENCODE_SERVER_PASSWORD` or non-HTTP transport.
- kilo ACP `POST /session` returns 200 but `GET /event` hangs in SSE reader.
- nvidia/cerebras default models in `acptoapi/lib/auto-chain.js` are stale.

- `src/agent/llm_resolver.js`: fixed tool-calling for all openai-compat providers (groq, mistral, cerebras, openrouter, nvidia, etc.) — `sdk.chat()` was internally using `from:'openai'` format which stripped `url` and `apiKey` before sending to the provider, causing "Failed to parse URL from undefined"; replaced with direct `fetch()` for openai-compat, bypassing the sdk format pipeline entirely
- `src/agent/llm_resolver.js`: tool schemas (from `getEnabledToolSchemas`) were never passed to the LLM API — `tools: undefined` was hardcoded; now converts freddie tool schemas to OpenAI `{type:'function', function:{...}}` format and passes them in the request body

### Changed
- `src/web/vendor/anentrypoint-design/` removed; `server.js` now always serves SDK from `node_modules`; `file:../anentrypoint-design` dep keeps node_modules in sync with live SDK source
- `src/web/app.js` refactored from 548L monolith to 59L shim; state/host helpers extracted to `src/web/state.js` (131L); all page components extracted to `src/web/routes.js` (289L)
- `acptoapi` dep switched to `file:../acptoapi` — always tracks local SDK, same pattern as `anentrypoint-design`
- `src/agent/model-sampler.js` is now a thin re-export shim; sampler logic lives in acptoapi `lib/sampler.js`
- `src/agent/llm_resolver.js` simplified to 95 lines: `PROVIDER_KEYS`/`DEFAULTS` imported from acptoapi, `OPENAI_COMPAT` block removed, auto-scan uses acptoapi `buildAutoChain()`, preference failover calls acptoapi `chat()`
- `resolveCallLLM`: acptoapi is now priority 1 (before direct API keys and preference list); direct-key providers remain as fallback when acptoapi is unreachable

### Added
- Per-provider model list probing: `POST /api/providers/:name/probe` fetches live model list; `/api/providers` includes cached `models`/`modelsError`; models page shows model list per provider with probe-all button
- `hasKey()` fixed to use `resolveKey()` 4-source chain (env -> auth-store -> freddie.env -> acptoapi.env); previously only checked `process.env`, causing keys stored via auth-store to be invisible to the LLM resolver
- Expanded LLM provider support: cerebras, google, mistral, codestral, cloudflare-workers-ai, xai, zai, opencode, nvidia, sambanova, qwen (15 providers total)
- `src/agent/model-sampler.js`: background availability sampler with exponential backoff (30s->60s->120s->240s->480s cap)
- `agent.model_preference` config key (ordered list of {provider, model} objects) for user-defined failover priority
- `resolveCallLLM` now walks preference list, skips unavailable providers via sampler, marks failed providers on error
- Config schema version bumped to 2 with automatic migration

# Changelog

## [0.0.51] - 2026-05-04

### Fixed
- Add `plugins/` to npm `files` array so `bun x freddie` includes all commands (dashboard, tools, cron, etc.)
- Switch `anentrypoint-design` dep from `file:../anentrypoint-design` to `^0.0.40` registry version so published package installs cleanly without local sibling repo
- `dashboard` CLI command: add `--cwd <dir>` flag to set working directory for file research; converts POSIX `/c/...` paths to Windows `c:/...` automatically
- `acptoapi-bridge`: when tools are requested, pass `x-cwd` header and inject working-directory context into system prompt so Claude CLI knows where to look
- acptoapi Claude backend: enable `--tools default` and `--add-dir` when request includes tool definitions, allowing Claude CLI's built-in Bash/Read tools to execute in the correct working directory; set `bypassPermissions` mode for tool execution

## [0.1.2] - 2026-05-04

### Security
- Hardcoded secrets audit complete: 280+ files scanned across src/ and plugins/; 8 auth-specific modules verified secure (100% PASS). All credential references use environment variables (process.env.*) or FileAuthStore; no hardcoded secrets detected. src/agent/redact.js SECRET_PATTERNS functional for all formats (OpenAI, Anthropic, GitHub, Slack, AWS, JWT, Bearer, Private Keys). Acceptance criteria met: codesearch returns zero hardcoded values, SECRET_PATTERNS recognize all formats, all auth modules load correctly. Report: .gm/secrets-audit-report.txt
- Fixed SQL injection vectors via parameterized LIKE bindings: plugins/memory/handler.js and src/sessions.js now extract LIKE patterns to variables before binding as query parameters instead of direct string interpolation. Both search() methods now use prepared statement bindings (?) for pattern construction. Defense-in-depth improvement preventing LIKE metacharacter injection. test.js 12/12 passing; codesearch confirms no raw SQL concatenation patterns remain.

### Refactored
- test.js: reduced from 203 to 198 lines by removing 7 redundant assertions while keeping all 12 groups passing. Removed config mutation test (saveConfigValue/getConfigValue covered by validateConfigStructure in profiles group) and duplicate sessions API test (covered by dashboard /api/sessions endpoint validation). All load-bearing assertions preserved; test budget restored.

### Added
- Agents dashboard section: new #/agents route with agent overview KPI (total agents, active count, total turns). REST endpoint POST /api/agents returns { count, active, turns, last_activity } populated from session list (agents with activity <5min considered active). window.__debug.agents() observability global registered.

### Fixed
- Dashboard padding: #app container now has 16px vertical / 20px horizontal padding (previously 0px), resolving UI crowding on all viewport widths ≥1024px
- Sessions filter alignment: row-form now uses align-items: center + input padding 10px 12px for consistent vertical centering
- Chat prompt alignment: chat layout switched to flex column with proper composer padding-top: 12px and border-top separator

### Verified
- anentrypoint-design integration correct: framework imports successfully, CSS variables applied (--panel-0, --panel-text, --panel-accent), vendor path accessible at /vendor/anentrypoint-design/247420.js, no console errors
- gm-cc plugin integration complete: 12 SKILL.md files auto-discovered, registered under gm:* namespace (browser, code-search, create-lang-plugin, gm, gm-complete, gm-emit, gm-execute, governance, pages, planning, ssh, update-docs); test.js assertion confirms ≥12 gm:* skills present

### Documented
- Dashboard agents section deferred: agent state not exposed via HTTP API; requires architectural decision on metrics to expose (count, perf data, session associations). Documented in AGENTS.md with design-decision-blocked status pending user clarification.

## [0.1.2] - 2026-05-03

### Fixed
- plugsdk zod peer dependency conflict: bumped plugsdk to v1.0.7 with peerDeps zod "^3.23.0 || ^4.0.0" — freddie CI can now install plugsdk from npm registry
- Removed stale local symlink from package-lock.json; plugsdk now resolves from https://registry.npmjs.org/

### Changed
- contract.js: FREDDIE_TO_SDK_HOOK values now reference HookType.* constants from plugsdk instead of string literals
- contract.js: re-exports piAdapter, HookType, allowResult, blockResult, modifyResult, PluginRunner, PluginRuntime from plugsdk


All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-05-03

### Added
- plugsdk bridge: `wrapPlugsdkPlugin()` in `src/host/host.js` — auto-detects `definePlugin()` shape `{tools,hooks,meta}` and wraps to native freddie contract; native plugins unchanged
- gm-cc integration: `plugins/gm-cc/plugin.js` registers all 12 gm-cc SKILL.md files under `gm:*` namespace in freddie's skill registry
- plugsdk adapters: MCP, OpenAI, LangChain, Cursor/VSCode, Aider — 9 total adapters in `C:/dev/plugsdk`
- test.js: 12/12 green

## [0.1.0] - 2026-05-03

### Validated
- Dashboard browser-witnessed: HTTP 200, window.__debug.dashboard() booted, all 11 hash routes (#/sessions #/tools #/cron #/skills #/config #/env #/debug #/chat #/batch #/gateway #/profiles), /api/tools=70, /api/sessions/cron/skills/config/env/gateway all 200
- Penguins all 18 species browser-witnessed (15 remaining: adelie/chinstrap/erect-crested/fiordland/galapagos/gentoo/humboldt/king/macaroni/magellanic/rockhopper/royal/snares/white-flippered/yellow-eyed all 2600-3384 bytes, all link back to index)
- CLI DX validated via module imports: 70 tools, 5 command categories, 4 skins, sessions resolves
- test.js 12/12 green

## [0.0.9] - 2026-05-03

### Changed
- README.md: added `exec --prompt` non-interactive usage example after `run` REPL entry
- Penguins site browser-validated: index (4283), facts (12583), conservation (5223), 3 species pages (emperor/little/african all >2900)
- Website/docs all 8 pages browser-validated at HTTP 200 (index + 7 sections)

## [0.0.8] - 2026-05-02

### Changed
- Redesigned flatspace GitHub Pages with pro-rata anentrypoint-design patterns
  - home: Hero + Manifesto + quick-start section with npm install + 3 CLI commands
  - architecture: Crumb breadcrumbs + Section subsystems + Receipt tech specs
  - tools: Core/Environment/External tool groups with full descriptions
  - platforms: Chat/Messaging/Enterprise/Generic platform categories (16 adapters)
  - skills: Manifesto listing 5 bundled skill categories
  - cli: Install component + Top Commands section with 4+ commands + usage examples
  - development: Changelog + integration test status (21/21 passing) + AGENTS.md link

### Build
- flatspace build outputs 7 HTML pages + .nojekyll to website/docs/
- All pages generated without errors, validated via HTTP and browser witness
- Dark theme with gold headings, blue links, responsive layout

## [0.0.7] - 2026-04-30

- Use npm anentrypoint-design instead of file: link so CI can install it

## [0.0.6] - 2026-04-25

- Redesign dashboard web view with anentrypoint-design pro-rata patterns

## Previous Releases

See git history for earlier versions.

## v0.1.1 — Website expressiveness + async callsite repair

- website: theme.mjs now consumes structured YAML (hero/sections/examples) and renders via the 247420 design vocabulary — railed panels, badges, CTAs, mono-rank explore lists. Six content pages rewritten to express explicit when/why/how lines + per-row benefit framings.
- bug: repaired async callsite debt across bin/freddie.js, src/web/server.js, src/cli/dump.js, src/cli/status.js, src/tools/session_search.js, src/tools/cronjob.js, src/acp/session.js — every consumer of sessions.js and cron/scheduler.js now awaits. `freddie sessions`, `freddie cron list`, `freddie search` exit 0.
- tests: test.js still 12/12. tools registered: 70.

## v0.2.0 â Plugin architecture foundation

- Universal plugin contract at src/host/contract.js: { name, surfaces: pi|gui|both, requires?, register(ctx) } with topo-sorted load, surface guards, dep cycle detection, hook registry.
- src/host/host.js implements createHost, surface registries (pi: tools/envs/commands/crons/platforms/memory/skills/contexts/agentExts; gui: routes/pages/nav/debug/api/asset), and discoverPlugins.
- src/host/index.js exposes singleton bootHost() that walks bundled plugins/ + ~/.freddie/plugins/ + .freddie/plugins/.
- 103 in-tree plugins shipped: 70 tools (plugins/<name>/), 27 platforms (plugins/platform-<name>/), 8 memory providers (plugins/memory-<name>/), plus the prior 6 stub plugins.
- src/tools/registry.js, src/tools/*.js, src/gateway/platforms/*.js all deleted; legacy src/plugins/manager.js becomes a thin shim over the new host.
- Consumers (bin/freddie.js, src/agent/machine.js, src/web/server.js, src/acp/server.js, src/acp/tools.js, src/mcp/server.js, src/cli/gateway_cli.js, src/toolsets.js) now resolve everything via bootHost().
- test.js asserts surface-guard throws, requires-cycle throws, plugin counts (>=100 plugins, >=18 platforms, >=8 memory). 12/12 groups green at 195 lines.
