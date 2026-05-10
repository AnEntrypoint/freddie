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

## Multi-project workspace system (2026-05-04)

Freddie supports multiple isolated projects, each with its own home directory and plugin set. Registry at `~/.freddie/projects.json` stores `{ active, projects: [{name, path, created_at}] }`. Default project (`~/.freddie`) is protected from deletion.

Code:
- `src/projects.js` — CRUD: `loadRegistry()`, `listProjects()`, `getActiveProject()`, `createProject({name, projectPath})`, `deleteProject(name)`, `setActiveProject(name)`, `applyActiveProjectFromRegistry()`. 
- `src/home.js` — added `applyHomeOverride(absPath)` to set `FREDDIE_HOME` env and clear cached home.
- `src/host/index.js` — `bootHost()` calls `applyActiveProjectFromRegistry()` before plugin discovery, so plugins resolve against active project root.
- `plugins/gui-projects/plugin.js` — GUI plugin exposing `GET /api/projects`, `POST /api/projects` (create), `DELETE /api/projects/:name`, `POST /api/projects/active` (switch).
- `src/web/app.js` — `#/projects` route, project pill in topbar, full CRUD UI.

Isolation boundary: Each project gets its own sessions DB, config.json, skills/, plugins/, cron.db, batches/, logs/, auth.json (all under `getFreddieHome()`). Plugins re-read paths per-request via `getFreddieHome()`.

**Runtime switch caveat** — Switching active project calls `resetHostForTests()` and clears caches but does NOT re-discover plugins in the running dashboard. UI alerts user to restart dashboard for plugin reload. New process auto-picks up active project via `applyActiveProjectFromRegistry()` on `bootHost()`. Gap: if user switches project then uses a plugin-registered tool before restarting, the OLD project's tool set loads. `/api/health` returns `{ freddie_home: "<active-project-path>" }` after project switch. Needs improvement: in-process plugin re-discovery on project switch.

## Layout

```
src/home.js                      # getFreddieHome, applyProfileOverride, applyHomeOverride
src/projects.js                  # Multi-project registry CRUD (loadRegistry, createProject, deleteProject, setActiveProject)
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
- **GitHub Actions deploy-pages@v5 duplicate artifact rejection** — When using `actions/deploy-pages@v5` in a workflow, the action rejects if 2+ artifacts are named "github-pages" (e.g. from a previous failed run re-uploaded by `gh run rerun --failed`). Symptom: deployment step fails with "artifact with name github-pages already exists" or similar. Fix: trigger a fresh run via empty commit instead of rerunning the failed deploy step. `gh run rerun` can silently re-upload transient failures; avoid for deploy failures in particular.
- **Rebase regression trap — ROOT FIX applied 2026-05-04** — After `git pull --rebase` following a rejected push, a CI auto-bump commit on remote (based on pre-fix tree) can silently revert local fixes. The `anentrypoint-design: file:../anentrypoint-design → ^0.0.40` fix in commit `d469d25` was reverted this way. Underlying cause: `.github/workflows/restore-package.cjs` rewrote the dep back to `file:../anentrypoint-design` after every release, and `publish.yml` ran `git checkout -- package-lock.json`, discarding lockfile re-sync. **ROOT FIX (2026-05-04)**: restore-package.cjs now does `npm view anentrypoint-design version` and pins `^<latest>` instead; publish.yml runs `npm install --package-lock-only` to keep lockfile valid. Verification: after any rebase, check `package.json` + `package-lock.json` match expected values. Sanity check: `git show HEAD:package.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.dependencies['anentrypoint-design'])"`. **Recurrence tell** — if pages CI fails with "lock file's anentrypoint-design@X.Y.Z does not satisfy anentrypoint-design@" (empty version = file: dep), do not manually re-pin in package.json forever; audit `.github/workflows/restore-package.cjs` and `publish.yml` for reversion.

## Subsystem guide

| Concern | Freddie location |
|---|---|
| Agent loop | `src/agent/machine.js` (xstate) + `@mariozechner/pi-agent-core` |
| CLI entry | `bin/freddie.js` (commander) + pi-coding-agent InteractiveMode |
| Tool registry | `src/tools/registry.js` + `src/tools/{bash,read,write,edit,grep}.js` |
| Toolsets | `src/toolsets.js` |
| Session store | `src/sessions.js` (better-sqlite3 + FTS5) |
| Home + profiles | `src/home.js` |
| Multi-project registry | `src/projects.js` (isolated FREDDIE_HOME per project) |
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
- **LLM resolver priority** — (1) explicit provider arg, (2) `agent.model_preference` config array (ordered failover, sampler-gated), (3) acptoapi if `/v1/models` returns 200, (4) env-key scan across all 15 providers, (5) throw with actionable error. Configurable via `FREDDIE_LLM_URL` and `FREDDIE_LLM_MODEL` env vars.
- **15-provider support** (2026-05-10) — `src/agent/llm_resolver.js` supports: anthropic, openai, groq, openrouter, cerebras, google, mistral, codestral, cloudflare-workers-ai, xai, zai, opencode, nvidia, sambanova, qwen. nvidia/sambanova/qwen use direct OpenAI-compat fetch; others route via pi-bridge. PI_ENV_ALIAS maps google→GEMINI_API_KEY and codestral→CODESTRAL_API_KEY for pi-ai compatibility.
- **Model sampler + exponential backoff** (2026-05-10) — `src/agent/model-sampler.js`: `isAvailable(provider)` / `markFailed(provider)` / `markOk(provider)` / `resetAvailability(provider)` / `getStatus()`. Backoff steps: 30s→60s→120s→240s→480s. `startSampler(getProbes)` runs every 30s via unref'd setInterval.
- **model_preference config key** (2026-05-10) — `agent.model_preference: []` in `~/.freddie/config.yaml`. Array of `{ provider, model? }` objects; `resolveCallLLM` tries each in order, skipping unavailable (sampler-gated) and marking failures with backoff. Config v2 migration adds the key on upgrade from v1.
- **acptoapi Claude backend verified** (2026-05-03) — Live agent loop working: start acptoapi server `node bin/agentapi.js --port 4800` (c:\dev\acptoapi), then set `FREDDIE_LLM_URL=http://localhost:4800/v1 + FREDDIE_LLM_MODEL=claude/haiku`. Model prefix `claude/` routes to Claude CLI subprocess. freddie test.js 12/12 green confirming integration production-ready. Dashboard `/api/chat` and `/api/batch` are POST-only; GET returns 404 (correct).

## Pre-rename validation snapshot (2026-05-03)

All 12 test.js named groups passing: home+config+skin, sessions+FTS5, tools+toolsets, agent-machine, gateway+platforms+hooks, acp-full, plugins+memory, profiles+observability+auth+env+context+cron+batch+slash+skills, utils+time+redact+model-meta+agent-helpers, mcp+swe+distributions+account+credpool, compressor+trajectory, env+pi+cli+tui+setup+website+helpers. CLI boots (`node bin/freddie.js --version` → 0.1.0), tools list 25+ across core/browse/creative, commander 14 commands. 284 source files, test.js 198/200 lines, pkg.version 0.0.39 but bin reports 0.1.0. Node_modules installed, lockfile present. Baseline established before rename; re-run test.js post-rename to isolate rename-induced failures.

## Learning audit

- 2026-05-04 (session 1): Multi-project workspace system documented. Registry, CRUD ops, isolation boundaries, GUI plugin, and runtime plugin switch caveat added. 4 facts ingested to rs-learn: project/freddie-multi-project-registry, reference/freddie-projects-module, reference/freddie-gui-projects-endpoints, feedback/freddie-project-switch-reload-limitation. Reach check passed (in-reach). AGENTS.md updated with new subsystem section + Layout entries + subsystem guide row.
- 2026-05-04 (session 2): Audit cycle — 5 queries fired (pi-ai env keys, profile safe paths, libsql async debt, browser syntax errors, plugin architecture contract). rs-learn store still returning "No recall results" or off-topic trajectory entries. All 5 recalls failed. 0 items migrated; all AGENTS.md facts retained (safe default). Ingest path confirmed live (4 facts accepted), but retrieval side empty. Likely requires backend indexing rebuild or cross-session propagation.
- 2026-05-01: 5 items queried (pi-ai keys, profile paths, cache safety, floosie composition, browser errors); rs-learn store unavailable (exec:recall returned no results). 0 items migrated. New facts (anentrypoint-design build, dashboard live-rerender caveat, libuv spawn caveat) ingested directly into rs-learn; audit will retry in future sessions.
- 2026-05-01 (session 2): 5 items queried (pi-ai env keys, profile safe paths, cache safety, floosie composition, browser syntax errors). rs-learn store still empty. 0 items migrated. Refined anentrypoint-design source/dist skew entry in AGENTS.md to include silent-failure pageerror diagnostic. New fact `reference/anentrypoint-design-dist-rebuild` ingested.
- 2026-05-03: Pre-rename validation snapshot recorded (all 12 test.js groups, CLI, tools, 284 files, version drift). Baseline stored to isolate post-rename regressions.
- 2026-05-03 (session 2): Ingested feedback/app-js-size-violation (src/web/app.js 548L violation) into AGENTS.md Substrate gotchas. rs-learn store unavailable (exec:memorize missing binary). 0 migration audit items queried. 1 new fact added.
- 2026-05-03 (session 3): Added Website theme + YAML caveats section (3 items: structured-YAML rendering, YAML colon-space trap, SSR innerHTML injection). rs-learn store still unavailable (exec:memorize → exit 127, command not found). 0 migration audit items queried. 3 new facts added to AGENTS.md only.
- 2026-05-03 (session 3): Ingested libsql-async-debt-class into AGENTS.md Substrate gotchas (sessions.js + cron/scheduler.js async callsites; silent TypeError class; test.js passes while CLI broken). rs-learn store still unavailable (exec:memorize/exec:recall not on PATH). 0 migration audit items queried. 1 new fact added.
- 2026-05-03 (session 4): Plugin-architecture decomposition recorded — added "Plugin architecture" section before Layout, rewrote "Adding a tool" + "Adding a gateway platform" for plugins/<name>/{plugin,handler}.js shape. Ingested 6 facts to rs-learn (project/freddie-plugin-architecture, reference/freddie-host-contract, reference/freddie-plugin-ctx, project/freddie-migrated-subsystems, reference/freddie-thin-shims, project/freddie-plugin-witness). Audit: 5 queries fired (pi-ai env keys, profile safe paths, libsql async debt, browser inline module errors, yaml colon space trap, plus self-test on freddie-plugin-architecture) — all returned "No recall results". rs-learn ingest path live but retrieval side empty for this session (likely needs learn-build propagation). 0 items migrated; AGENTS.md items retained.
- 2026-05-04: Recorded freddie publish workflow root fix — `.github/workflows/restore-package.cjs` now pins anentrypoint-design via `npm view` + version (`^<latest>`) instead of file: dep; `publish.yml` runs `npm install --package-lock-only` to sync lockfile. Updated "Rebase regression trap" entry with detailed causation + recurrence tell. Added new "GitHub Actions deploy-pages@v5 duplicate artifact rejection" caveat (rerun --failed silently re-uploads; trigger fresh run instead). rs-learn store still unavailable. 0 items migrated; 2 facts added/refined in AGENTS.md.
- 2026-05-10: 15-provider LLM resolver expansion. Added model-sampler.js (backoff), PROVIDER_KEYS/DEFAULTS expansion, model_preference config key, config v2 migration. Updated "LLM resolver priority" + "15-provider support" + "Model sampler" + "model_preference" entries in AGENTS.md. test.js 12/12 green at exactly 200 lines. rs-learn store still unavailable. 4 new facts added to AGENTS.md.

## Dashboard web UI caveats

- **anentrypoint-design v0.0.27 source/dist skew** — Published npm package lags behind source in C:/dev/anentrypoint-design. New components (EmptyState, etc.) present in source but missing from dist/247420.js until rebuild. Run `node scripts/build.mjs` in the design repo (emits dist/247420.js ~441KB + 247420.css; build ~150ms); warning "[247420] missing css: vendor/rippleui-1.12.1.css" is benign. Skip rebuild and browser-witness new component usage: silent pageerror "component is not a function" kills app mount with no output in #app. freddie/package.json uses `file:../anentrypoint-design` so npm install always mirrors rebuilt dist without publish cycles.
- **Live page rerender caveat** — AppState.body caching (page computed once at navigation, body saved) breaks for live routes like #/chat where AppState is mutated mid-flight (SSE pushes new messages). Fix: detect live routes in rerender(), recompute body: `if (AppState.hash === '#/chat') { Promise.resolve(PAGES['#/chat']()).then(b => { AppState.body = b; _mount() }); return }`. Any future live-streaming pages (cron output, traces) need the same treatment.
- **libuv spawn caveat** — Spawning createDashboard() from exec:nodejs and keeping process alive triggers libuv UV_HANDLE_CLOSING crash on shutdown. Reliable alternative: boot via `node bin/freddie.js dashboard --port <port>`. Liveness checks: exec:browser → page.goto → window.__debug.dashboard() returns {booted, ts, framework, route}; window.__debug.chat() exposes {messages, streaming, draft}; window.__debug.sendChat(text) drives round-trips.
- **anentrypoint-design theme token descendant selector fix** (2026-05-04) — SDK CSS scopes light/dark theme variables under descendant selectors `.ds-247420 [data-theme="dark"]` and `.ds-247420 [data-theme="light"]`. Placing both `class="ds-247420"` and `data-theme="dark"` on the same node (e.g. `<html>`) breaks theming: the descendant selector does NOT match when both attributes are on the same element. Fix: scope `class="ds-247420"` on `<html>` and `data-theme="dark"` on `<body>`. Theme toggle must write to `document.body`, not `document.documentElement`. Browser-witnessed commit 17dfce0: pre-fix dark/light backgrounds identical (rgb 26,27,30); post-fix dark=rgb(26,27,30), light=rgb(245,240,228). Symptom: toggle theme in dashboard, page background does not change.

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

## Dashboard Agents Section — Design Decision Needed (2026-05-04)

User requested "agents section" for dashboard. Exploration result: agent state is **not exposed** via HTTP API. Dashboard is client-side UI consuming only HTTP endpoints. Current endpoints: `/api/sessions`, `/api/tools`, `/api/health`. No `/api/agents`.

To implement:
1. Export agent machine state (xstate snapshot) from `src/agent/machine.js`
2. Create new HTTP endpoint `/api/agents` returning count, active agent, metrics
3. Add `#/agents` route + new PAGES entry to `src/web/app.js`
4. Register `window.__debug.agents()` observability global

**Blocked on**: Design decision (what metrics? count only? session associations? perf data?). Deferred pending user clarification.
