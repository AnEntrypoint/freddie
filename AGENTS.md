# Freddie — Agent Guide

Instructions for AI coding assistants working on Freddie.

## Substrate (do not reimplement)

- `@mariozechner/pi-coding-agent` — agent + tools + interactive TUI. Use `AgentSession`, `BashExecutionComponent`, `ModelRegistry`, `InteractiveMode`, `FileAuthStorageBackend`, `ExtensionRunner`.
- `@mariozechner/pi-agent-core` — `Agent`, `agentLoop`, `runAgentLoop`, `streamProxy`. Wrap in xstate, do not rewrite.
- `@mariozechner/pi-ai` — `complete`, `completeSimple`, `AssistantMessageEventStream`, `registerApiProvider`, `getModel`, `calculateCost`, `parseStreamingJson`, `isContextOverflow`. THE provider layer.
- `@mariozechner/pi-tui` — TUI primitives (Ink-equivalent).
- `floosie` v0.6.14 — `ProcessorMachine` (xstate). Use for gateway pipelines.
- `anentrypoint-design` v0.0.27 — webjsx + ripple-ui. Use for any web UI; do NOT add React. Source in C:/dev/anentrypoint-design; freddie links via `file:../anentrypoint-design`.
- `xstate` v5 — every long-lived state machine (agent turns, gateway lifecycle, approvals).

## Plugin architecture (2026-05-03, pre-v1, no compat shims)

The monolith was decomposed into a universal plugin contract. Every tool, platform, memory provider, GUI route, and core subsystem is a plugin under `plugins/<name>/`. The old paths (`src/tools/registry.js`, `src/tools/*.js`, `src/gateway/platforms/*.js`, `src/plugins/memory/*.js`) are GONE — do not reach for them.

Contract: `{ name, version?, surfaces: 'pi'|'gui'|'both', requires?: [...names], register(ctx) }` — defined in `src/host/contract.js` (39L).
- PI_VERBS: tool, env, command, cron, platform, memory, skill, context, agentExt, cli
- GUI_VERBS: route, page, nav, debug, api, asset
- HOOK_NAMES: preToolCall, postToolCall, preLlmCall, postLlmCall, onSessionStart, onSessionEnd, onTurnStart, onTurnEnd, onMessageInbound, onMessageOutbound
- Surface guard throws `plugin <name>: surface verb '<verb>' not allowed (declared surfaces=<name>)` at load
- `requires` cycles throw `plugin cycle: a -> b -> a` synchronously

Host: `src/host/host.js` (157L) — `createHost({surfaces, configStore, env})` + `discoverPlugins(roots)`. Singleton in `src/host/index.js`: `host()`, `bootHost(extraRoots)`, `resetHostForTests()`. Roots walked: `<repo>/plugins`, `~/.freddie/plugins/`, `<cwd>/.freddie/plugins/`.

`register(ctx)` receives `{ pi, gui, hooks, log, config, host, env }`:
- `log` — scoped JSONL with plugin name
- `config` — scoped under `plugins.<name>` (`get/set/all`)
- `host` — `{plugins(), get(name)}`

Migrated 120+ in-tree plugins: 70 tools, 27 platforms, 8 memory providers, 11 GUI dashboard plugins (`gui-sessions/tools/cron/skills/config/env/debug/chat/batch/gateway/profiles-commands-health`), 6 core plugins (`core-cli/skills/cron/commands/agent-machine/context-engine/compressor`). Tool plugins lay out as `plugins/<name>/{plugin,handler}.js` where handler exports `_tool` or `_tool0`/`_tool1` for multi-tool files; `plugin.js` calls `pi.tools.register(_tool)`.

Thin shims (still resolved through host, do not bypass):
- `src/plugins/manager.js` — over the host
- `src/web/server.js` (23L) — iterates `host.gui.routes.list()`
- `bin/freddie.js` (19L) — iterates `host.pi.cli.list()` and registers commander commands
- `src/gateway/platforms.js` — `makePlatform/getPlatformAdapter/listPlatformNames` (finds adapter by `*Adapter$` name match)
- `src/plugins/memory/provider.js` — host-router (`createMemoryProvider`, `listMemoryProviders`, `registerMemoryProvider`, `MemoryProvider`)
- All consumers (`acp/server.js`, `acp/tools.js`, `mcp/server.js`, `agent/machine.js`, `toolsets.js`, `cli/gateway_cli.js`) resolve via `bootHost()`

Witness 2026-05-03: test.js 12/12 green @ 195L (asserts `host.plugins().length>=100`, `platforms.list>=18`, `memory.list>=8`, surface guard throws, cycle throws). `node bin/freddie.js tools` shows 70. `help-all` 32 lines. 11 dashboard `/api/*` routes return 200.

**gm-cc plugin integration** (2026-05-04) — gm-cc npm package (v2.0.727) successfully integrated via `plugins/gm-cc/plugin.js`. Plugin auto-discovers 12 SKILL.md files from gm-cc package, extracts name/description from YAML frontmatter, registers via `pi.skills.register({name: 'gm:'+name, description, content, source:'gm-cc'})`. Skills: browser, code-search, create-lang-plugin, gm, gm-complete, gm-emit, gm-execute, governance, pages, planning, ssh, update-docs. All accessible via `gm:*` namespace in pi.skills registry.

## Layout

```
src/home.js                      # getFreddieHome, applyProfileOverride
src/config.js                    # loadConfig, saveConfigValue, DEFAULT_CONFIG, _config_version migrations
src/sessions.js                  # better-sqlite3 + FTS5
src/auth.js                      # FileAuthStore for credentials
src/tools/registry.js            # tool registration + dispatch
src/tools/{bash,read,write,edit,grep,todo,memory,delegate,web_search,image_gen,browser}.js
src/tools/environments/{local,docker,ssh,index}.js  # execution environments
src/toolsets.js                  # _FREDDIE_CORE_TOOLS, getEnabledToolSchemas
src/agent/machine.js             # xstate turn machine
src/agent/pi-bridge.js           # @mariozechner/pi-ai callLLM adapter
src/agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js  # context compressor
src/commands/registry.js         # CommandDef + resolveCommand + gateway/telegram/slack views
src/commands/profile.js          # profile CRUD
src/cli/interactive.js           # readline REPL, skin-aware
src/context/engine.js            # context block builders (file, skills, memory)
src/cron/{scheduler,cron-parse}.js  # persistent cron jobs
src/batch.js                     # parallel batch runner
src/web/{server,index.html}      # dashboard (express + anentrypoint-design webjsx)
src/gateway/run.js               # Gateway + hooks
src/gateway/platforms/*.js       # webhook + api_server + 16 functional adapters
src/acp/server.js                # JSON-RPC stdio
src/plugins/manager.js           # PluginManager
src/plugins/memory/{provider,_index,honcho,mem0,supermemory,byterover,hindsight,holographic,openviking,retaindb}.js
src/skills/index.js              # SKILL.md loader
src/skin/engine.js               # _BUILTIN_SKINS + load/get/set
src/observability/log.js         # structured logs
src/observability/debug.js       # /debug registry
skills/                          # bundled skill bundles (creative/, software-development/, ops/, data/, planning/)
website/                         # flatspace docs site: flatspace.config.mjs + theme.mjs + content/pages/*.yaml + docs/ (build output)
bin/freddie.js                     # commander CLI: tools, skills, profile, skin, sessions, search, gateway, acp, run, cron, batch, dashboard, help-all
```

## Adding a tool

Tools are now plugins. Create `plugins/<name>/plugin.js` + `plugins/<name>/handler.js`:

```js
// plugins/my-tool/handler.js
export const _tool = {
    name: 'my_tool',
    toolset: 'core',
    schema: { name: 'my_tool', description: '…', parameters: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } },
    handler: async (args, ctx) => ({ ok: true, x: args.x }),
    checkFn: () => !!process.env.MY_KEY,
    requiresEnv: ['MY_KEY'],
}

// plugins/my-tool/plugin.js
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

Dispatch happens against the canonical name resolved via `resolveCommand()`. Gateway/telegram/slack views derive automatically.

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

`makePlatform('myname', opts)` (from `src/gateway/platforms.js`) instantiates the adapter via `*Adapter$` name match.

## Profile-safe code

- Always `getFreddieHome()` for state paths. Never `path.join(os.homedir(), '.freddie')`.
- Always `displayFreddieHome()` for user-visible messages (returns `~/.freddie` or `~/.freddie/profiles/<name>`).
- Profile operations are HOME-anchored: `getProfilesRoot()` returns `~/.freddie/profiles` regardless of active profile.

## Cache safety

Slash commands that mutate system-prompt state default to deferred invalidation; opt-in `--now` for immediate. Mid-conversation prompt rewrites blow the cache and cost real money.

## Testing

One `test.js` at project root. ≤200 lines. Plain assertions, real data, real services. No mocks. No fixtures. No `tests/` dir. New behavior = extend `test.js`, not a new test file.

## Substrate gotchas

- `pi-coding-agent` ships a photon-rs wasm; install needs network. Verified working on Windows.
- `pi-ai` reads provider keys via `findEnvKeys` / `getEnvApiKey`. Match its env var names (`ANTHROPIC_API_KEY`, etc.).
- `floosie.ProcessorMachine` is an xstate machine. Compose, don't fork.
- **Browser inline `<script type="module">` syntax errors** — When a pageerror reports "missing ) after argument list" with no file:line info, extract the script body to a separate `.js` file and run `node --check path/to/file.js`. Browsers swallow line numbers for inline modules; node's V8 parser prints exact line. Essential for debugging unbalanced parens in webjsx-style nested `h()` calls. (Confirmed 2026-04-30: freddie dashboard app.js, line 133.)
- **src/web/app.js 200-line policy violation** — File is 548 lines, violating gm hard cap (2.7× over). Only file in 283-file codebase over limit. Likely waived intentionally or is drift to fix. When touching app.js, prefer splitting into `{app,routes,components,state}.js` over expanding further. Do not add 50+ more lines without addressing the split.
- **libsql async debt class** — `src/sessions.js` (listSessions/search/getMessages/createSession/appendMessage) and `src/cron/scheduler.js` (listJobs/createJob/cancelJob/deleteJob) are async after the libsql migration. Sync callsites silently wrap each call in a Promise that rejects on iteration, surfacing as `TypeError: ... is not iterable` via `node bin/freddie.js sessions` or `freddie cron list`. Rule: every call into those modules must be awaited; tool ACTIONS inner functions async + handler awaits dispatched fn. Fixed 2026-05-03 across bin/freddie.js, src/web/server.js, src/cli/dump.js, src/cli/status.js, src/tools/session_search.js, src/tools/cronjob.js, src/acp/session.js. test.js can pass while CLI is broken — exercise the cli verb in test.js or smoke `node bin/freddie.js <verb>` after changes.
- **Bulk-rename: git grep is case-sensitive on literal patterns** — `git grep -lI <name>` only matches lowercase. For case-variant sweep during rename refactors, use `git grep -liI -e <lower> -e <Title> -e <UPPER>` (per-pattern `-i` requires `-e` form). Single-form check is a false-clean trap.
- **freddie exec command Windows invocation** — `plugins/core-cli/plugin.js` registers the `exec` command (commit e5fb1b7) for non-interactive scripted use. Correct invocation on Windows: `bun run bin/freddie.js exec --prompt "..."`. Do NOT use `bun x freddie` — it hangs on Windows due to npm registry fetch timeouts. The command takes `--prompt` (required), `--model` (default ''), `--timeout` (default 60000ms) and is the validated entry point for CI pipelines.
- **acptoapi-bridge max_tokens silent truncation** — `src/agent/acptoapi-bridge.js` line 20 controls max_tokens passed to the LLM. Prior to commit e5fb1b7, this was set to 1024, which silently truncated responses on generation tasks. Raised to 4096 to prevent hidden content loss. If generation output appears incomplete, verify max_tokens is 4096 or higher.

## Subsystem guide

| Concern | Freddie location |
|---|---|
| Agent loop | `src/agent/machine.js` (xstate) + `@mariozechner/pi-agent-core` |
| CLI entry | `bin/freddie.js` (commander) + pi-coding-agent InteractiveMode |
| Tool registry | `src/tools/registry.js` + `src/tools/{bash,read,write,edit,grep}.js` |
| Toolsets | `src/toolsets.js` |
| Session store | `src/sessions.js` (better-sqlite3 + FTS5) |
| Home + profiles | `src/home.js` |
| Structured logging | `src/observability/log.js` |
| Config | `src/config.js` |
| Commands | `src/commands/registry.js` |
| Skin engine | `src/skin/engine.js` |
| Gateway + platforms | `src/gateway/run.js` + `src/gateway/platforms/*.js` |
| ACP (JSON-RPC stdio) | `src/acp/server.js` |
| TUI | substrate (`pi-tui` + pi-coding-agent) |
| Plugins + memory | `src/plugins/manager.js` + `src/plugins/memory/provider.js` |
| Skills loader | `src/skills/index.js` — content drops into `~/.freddie/skills/` |
| Context compressor | `src/agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js` |
| Documentation site | `website/` (flatspace + content/pages/*.yaml + theme.mjs) |
| Cron scheduler | `src/cron/{scheduler,cron-parse}.js` |
| Batch runner | `src/batch.js` |
| Execution environments | `src/tools/environments/{local,docker,ssh}.js` (modal/daytona/singularity = explicit residual) |
| Dashboard | `src/web/{server,index.html}` (anentrypoint-design webjsx) |
| Auth store | `src/auth.js` (FileAuthStore) + pi-ai key resolution |
| Context engine | `src/context/engine.js` |
| Browser tool | `src/tools/browser.js` (puppeteer-core, lazy) |
| Image gen | `src/tools/image_gen.js` (openai/replicate) |
| Web search | `src/tools/web_search.js` (DDG/SerpAPI) |
| Todo | `src/tools/todo.js` |
| Memory tool | `src/tools/memory.js` |
| Delegate | `src/tools/delegate.js` |
| Bundled skills | `skills/` (5 categories, 12 SKILL.md placeholders) |
| Integration tests | one `test.js` at root per gm policy |

## Cross-project Rust gotchas

- **rs-plugkit exec utility verbs** (2026-04-30) — The plugkit.exe binary advertises `exec:status`, `exec:close`, `exec:sleep` in hook help, but the Cmd enum was missing Status/Close/Sleep variants. Fix applied to c:\dev\rs-plugkit\src\main.rs; awaiting CI rebuild. Until rebuilt: use `exec:wait <secs>` for waits, read task output files directly via fs.readFileSync instead of exec:status.
- **rs-exec timeout alias** — Both `--timeout` (long-form) and `--timeout-ms` (plugin convention) are accepted due to alias added to c:\dev\rs-exec\src\main.rs. Both Cmd::Exec and Cmd::Bash support either form.


## Plugsdk integration

- **plugsdk peerDependencies zod conflict** (2026-05-03) — plugsdk v1.0.6 declared `peerDependencies: { zod: "^3.23.0" }`, causing ERESOLVE when freddie installs with zod@^4.0.0. Fixed in plugsdk v1.0.7 by relaxing peer to `^3.23.0 || ^4.0.0`. Freddie now pins plugsdk@^1.0.7 (currently 1.0.8 on npm registry).
- **plugsdk package-lock.json symlink blockage** (2026-05-03) — freddie's package-lock.json contained a stale symlink entry from a prior `file:` dependency: `"resolved": "../plugsdk", "link": true`. This blocked `npm ci` in CI (non-registry installs fail when symlink target is missing or differs). Fix: removed the symlink entry, ran `npm install` to sync lockfile, then committed. Always install plugsdk from registry, not via file: dep.
- **plugsdk auto-publish workflow** — plugsdk publishes automatically to npm registry on push to main branch. Current version 1.0.8. freddie's contract.js re-exports `piAdapter`, `HookType`, `allowResult`, `blockResult`, `modifyResult` from plugsdk + uses `HookType` constants in `FREDDIE_TO_SDK_HOOK` mapping.
## Integration test status (2026-04-30)

All 21 named integration tests in `test.js` pass (exit 0). Subsystem coverage:
- agent loop, CLI, gateway, plugins, skills, sessions, cron, batch, dashboard, ACP, web, context-engine, compressor, auth, observability

## Windows libuv cleanup caveat

`test.js` adds explicit cleanup hooks before exit (`closeDb()`, `closeAll()` for log streams) to prevent libuv handle-teardown crash on Windows. Without these, exit hangs or returns non-zero. Critical for stability on Windows hosts.

## LLM backends and acptoapi

- **acptoapi bridge** — Integrated at `src/agent/acptoapi-bridge.js` + `src/agent/llm_resolver.js` (commit 5f55f1e). Localhost API (default port 4800) converting OpenAI/Anthropic SDK calls to multiple backends: Kilo Code, opencode, Claude CLI, Anthropic API, Gemini, Ollama, Bedrock. Endpoint `/v1/chat/completions`, OpenAI-compatible, accepts `Bearer none` auth.
- **LLM resolver priority** — (1) explicit `callLLM` arg, (2) pi-bridge if `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` env set, (3) acptoapi if `/v1/models` returns 200, (4) throw with actionable error. Configurable via `FREDDIE_LLM_URL` and `FREDDIE_LLM_MODEL` env vars.
- **acptoapi Claude backend verified** (2026-05-03) — Live agent loop working: start acptoapi server `node bin/agentapi.js --port 4800` (c:\dev\acptoapi), then set `FREDDIE_LLM_URL=http://localhost:4800/v1 + FREDDIE_LLM_MODEL=claude/haiku`. Model prefix `claude/` routes to Claude CLI subprocess. freddie test.js 12/12 green confirming integration production-ready. Dashboard `/api/chat` and `/api/batch` are POST-only; GET returns 404 (correct).

## Pre-rename validation snapshot (2026-05-03)

All 12 test.js named groups passing: home+config+skin, sessions+FTS5, tools+toolsets, agent-machine, gateway+platforms+hooks, acp-full, plugins+memory, profiles+observability+auth+env+context+cron+batch+slash+skills, utils+time+redact+model-meta+agent-helpers, mcp+swe+distributions+account+credpool, compressor+trajectory, env+pi+cli+tui+setup+website+helpers. CLI boots (`node bin/freddie.js --version` → 0.1.0), tools list 25+ across core/browse/creative, commander 14 commands. 284 source files, test.js 198/200 lines, pkg.version 0.0.39 but bin reports 0.1.0. Node_modules installed, lockfile present. Baseline established before rename; re-run test.js post-rename to isolate rename-induced failures.

## Learning audit

- 2026-05-01: 5 items queried (pi-ai keys, profile paths, cache safety, floosie composition, browser errors); rs-learn store unavailable (exec:recall returned no results). 0 items migrated. New facts (anentrypoint-design build, dashboard live-rerender caveat, libuv spawn caveat) ingested directly into rs-learn; audit will retry in future sessions.
- 2026-05-01 (session 2): 5 items queried (pi-ai env keys, profile safe paths, cache safety, floosie composition, browser syntax errors). rs-learn store still empty. 0 items migrated. Refined anentrypoint-design source/dist skew entry in AGENTS.md to include silent-failure pageerror diagnostic. New fact `reference/anentrypoint-design-dist-rebuild` ingested.
- 2026-05-03: Pre-rename validation snapshot recorded (all 12 test.js groups, CLI, tools, 284 files, version drift). Baseline stored to isolate post-rename regressions.
- 2026-05-03 (session 2): Ingested feedback/app-js-size-violation (src/web/app.js 548L violation) into AGENTS.md Substrate gotchas. rs-learn store unavailable (exec:memorize missing binary). 0 migration audit items queried. 1 new fact added.
- 2026-05-03 (session 3): Added Website theme + YAML caveats section (3 items: structured-YAML rendering, YAML colon-space trap, SSR innerHTML injection). rs-learn store still unavailable (exec:memorize → exit 127, command not found). 0 migration audit items queried. 3 new facts added to AGENTS.md only.
- 2026-05-03 (session 3): Ingested libsql-async-debt-class into AGENTS.md Substrate gotchas (sessions.js + cron/scheduler.js async callsites; silent TypeError class; test.js passes while CLI broken). rs-learn store still unavailable (exec:memorize/exec:recall not on PATH). 0 migration audit items queried. 1 new fact added.
- 2026-05-03 (session 4): Plugin-architecture decomposition recorded — added "Plugin architecture" section before Layout, rewrote "Adding a tool" + "Adding a gateway platform" for plugins/<name>/{plugin,handler}.js shape. Ingested 6 facts to rs-learn (project/freddie-plugin-architecture, reference/freddie-host-contract, reference/freddie-plugin-ctx, project/freddie-migrated-subsystems, reference/freddie-thin-shims, project/freddie-plugin-witness). Audit: 5 queries fired (pi-ai env keys, profile safe paths, libsql async debt, browser inline module errors, yaml colon space trap, plus self-test on freddie-plugin-architecture) — all returned "No recall results". rs-learn ingest path live but retrieval side empty for this session (likely needs learn-build propagation). 0 items migrated; AGENTS.md items retained.

## Dashboard web UI caveats

- **anentrypoint-design v0.0.27 source/dist skew** — Published npm package lags behind source in C:/dev/anentrypoint-design. New components (EmptyState, etc.) present in source but missing from dist/247420.js until rebuild. Run `node scripts/build.mjs` in the design repo (emits dist/247420.js ~441KB + 247420.css; build ~150ms); warning "[247420] missing css: vendor/rippleui-1.12.1.css" is benign. Skip rebuild and browser-witness new component usage: silent pageerror "component is not a function" kills app mount with no output in #app. freddie/package.json uses `file:../anentrypoint-design` so npm install always mirrors rebuilt dist without publish cycles.
- **Live page rerender caveat** — AppState.body caching (page computed once at navigation, body saved) breaks for live routes like #/chat where AppState is mutated mid-flight (SSE pushes new messages). Fix: detect live routes in rerender(), recompute body: `if (AppState.hash === '#/chat') { Promise.resolve(PAGES['#/chat']()).then(b => { AppState.body = b; _mount() }); return }`. Any future live-streaming pages (cron output, traces) need the same treatment.
- **libuv spawn caveat** — Spawning createDashboard() from exec:nodejs and keeping process alive triggers libuv UV_HANDLE_CLOSING crash on shutdown. Reliable alternative: boot via `node bin/freddie.js dashboard --port <port>`. Liveness checks: exec:browser → page.goto → window.__debug.dashboard() returns {booted, ts, framework, route}; window.__debug.chat() exposes {messages, streaming, draft}; window.__debug.sendChat(text) drives round-trips.

## Website theme + YAML caveats (2026-05-03)

- **Structured-YAML rendering** — `website/theme.mjs` (164L) renders structured YAML via 247420 design vocabulary, not raw markdown. Consumes `page.hero` (heading/subheading/accent/body/badges/ctas), `page.sections[]` (rotating rail color green→purple→mascot→sun→flame→sky by section index, optional `lede` + per-item `benefit` italic), `page.examples[]` (railed link list with mono numeric ranks + ↗ glyph). Falls back to `page.body` markdown for prose. Style block inlined so rail/dot/chip/btn classes work without ds-247420 SDK CSS loading first. To get a specific rail color, reorder sections. Prefer enriching hero+sections+examples over expanding body markdown; copy existing YAML structure as template for new pages.
- **YAML colon-space trap** — In `website/content/pages/*.yaml`, any value containing `: ` outside backticks (e.g. `[linux, macos, windows]`, `requiresEnv: ['MY_KEY']` code snippets) MUST be double-quoted. The parser otherwise interprets the embedded colon as a mapping and the file fails to load. Hit twice: tools.yaml line 72, skills.yaml line 40. Fix is wrapping the whole value in `"..."`.
- **SSR innerHTML injection beats client dispatch** — anentrypoint-design v0.0.27 exposes Hero/HomeView/Panel/Row/Section/WorksList, but pre-mounted SSR injection via innerHTML is more reliable than dispatching components client-side at build — avoids depending on SDK loading before the static HTML paints. Emitted HTML carries rail/dot/chip/btn classes with inline styles to be self-sufficient.

## Residual complement (NOT ported this session)

Genuinely out of session reach, with reasons:

- **Real credentials per platform** — adapters work; setup needs you to provide TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN, SLACK_BOT_TOKEN, etc. before `start()` succeeds. Listed in each adapter's `getRequiredEnv()`.
- **Memory provider API accounts** — 8 provider modules call real endpoints. Test runs construct objects but don't hit external APIs without keys (HONCHO_API_KEY etc.).
- **modal / daytona / singularity environments** — only local/docker/ssh ported. The other three are heavyweight remote-execution deps (Modal SDK, Daytona Cloud, Singularity containers).
- **Bedrock / codex provider adapters** — `pi-ai` covers Anthropic/OpenAI/Groq. Adding bedrock/codex requires registering custom providers via `pi-ai`'s `registerApiProvider`.
- **TUI Ink rewrite** — `pi-tui` IS the substrate (architectural choice, not a port).
- **15k pytest tests** — single `test.js` per gm policy.
