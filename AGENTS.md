# Freddie — Agent Guide

Instructions for AI coding assistants working on Freddie. Present-tense rules only — history lives in `git log` and `CHANGELOG.md`.

## Substrate (do not reimplement)

- `@mariozechner/pi-coding-agent` — agent + tools + interactive TUI. Use `AgentSession`, `BashExecutionComponent`, `ModelRegistry`, `InteractiveMode`, `FileAuthStorageBackend`, `ExtensionRunner`.
- `@mariozechner/pi-agent-core` — `Agent`, `agentLoop`, `runAgentLoop`, `streamProxy`. Wrap in xstate, do not rewrite.
- `@mariozechner/pi-ai` — `complete`, `completeSimple`, `AssistantMessageEventStream`, `registerApiProvider`, `getModel`, `calculateCost`, `parseStreamingJson`, `isContextOverflow`. THE provider layer.
- `@mariozechner/pi-tui` — TUI primitives (Ink-equivalent).
- `floosie` — `ProcessorMachine` (xstate). Use for gateway pipelines. Compose, don't fork.
- `anentrypoint-design` — webjsx + ripple-ui. **All GUI for freddie and thebird lives here.** Source in `C:/dev/anentrypoint-design`; freddie pins from npm registry. For local SDK iteration, swap to `file:../anentrypoint-design` and rebuild via `node scripts/build.mjs`. Do NOT add React.
- `acptoapi` — THE LLM SDK (see "acptoapi is THE SDK" below).
- `xstate` v5 — every long-lived state machine (agent turns, gateway lifecycle, approvals).

## Dynamic stack contract

The stack is **thebird → freddie → acptoapi**. Each layer owns one concern:

- **acptoapi** owns all upstream LLM/provider connectivity: HTTP/SSE to OpenAI, Anthropic, Gemini, brand providers, ACP daemons, Claude CLI. Plus chain/queue/sampler/matrix.
- **freddie** owns agent-loop orchestration: tools, skills, sessions, memory. Calls *only* acptoapi for LLM access. No direct `fetch('https://api.openai.com/...')`. Migration debt still present in `plugins/vision`, `plugins/image_gen`, `plugins/tts`, `plugins/transcription`, `src/agent/codex_responses_adapter.js`, `src/agent/image_gen_provider.js`, `src/agent/model-discovery.js` — when you touch one, add the matching endpoint to acptoapi and call through acptoapi.
- **thebird** owns browser presentation: webjsx UI, pyodide hermes shell. Talks to freddie for everything LLM-related when freddie is reachable; falls back to direct acptoapi only when there is no freddie.

Versioning: freddie pins `acptoapi: "latest"` so `npm install` always picks up the newest published acptoapi. Thebird vendors freddie via `scripts/sync-upstream.mjs` against upstream main. No manual version-bump churn between sibling repos.

## acptoapi is THE SDK

**Do not reimplement LLM resolution, chain fallback, sampler backoff, or matrix-aware scoring in freddie.** acptoapi is the single source of truth. `src/agent/llm_resolver.js` is a thin shim over `acptoapi.chat({model, messages, tools, queuesMap, matrixSource, onFallback, output})` that builds a comma-list model string from `[explicit, input.model, agent.model_preference, keyed buildAutoChain]` and delegates everything else.

Consume top-level acptoapi exports directly (no re-export shim, no helper module): `chat`, `stream`, `chain`, `chatChain`, `streamChain`, `fallback`, `buildAutoChain`, `resolveModel`, `parseCommaList`, `splitPrefix`, `listAllModelsAndQueues`, `resolveQueue`, `listAllQueues`, `loadMatrix`, `matrixScore`, `clearMatrixCache`, `peekStatus`, `getStatus`, `isAvailable`, `markFailed`, `markOk`, `resetAvailability`, `startSampler`, `stopSampler`, `createSampler`, `probe`, `probeModels`, `getCachedModels`, `getRunHistory`, `PROVIDER_KEYS`, `PROVIDER_DEFAULTS`.

Public surface reference: `node_modules/acptoapi/AGENTS.md` "Public API — unified chain SDK".

Acceptable freddie-side adapters:
- `model-discovery.js` — claude-cli/ACP/ollama probing breadth acptoapi doesn't cover. `listKnownProviders` merges `agent.discovered_models` keys + acptoapi `PROVIDER_KEYS` + `[claude-cli,kilo,opencode,ollama]`.
- `model-matrix.js` — MATRIX_FILE path helper + `matrixUsable` predicate. Freddie-side because the matrix file path is repo-local.
- `acptoapi-bridge.js` — HTTP daemon passthrough at `FREDDIE_LLM_URL` when reachable, for `claude/*` etc that need the OAuth-managed daemon.

Sampler funcs (`isAvailable`, `markFailed`, `markOk`, `resetAvailability`, `getStatus`, `probe`, `startSampler`, `stopSampler`, `createSampler`) come straight from `acptoapi` via `createRequire`. Backoff logic (5-step 30s→480s, createSampler factory, singleton) lives in `acptoapi/lib/sampler.js`. CJS/ESM boundary bridged via `createRequire(import.meta.url)`.

Matrix wired: shim passes `matrixSource: process.env.FREDDIE_MATRIX_URL || <repo>/.gm/model-availability.json` only for comma-list or `queue/<name>` model strings; single-shot omits to avoid leaking chain opts into upstream HTTP body.

## LLM resolver priority

1. explicit provider+key
2. acptoapi if `/v1/models` returns 200
3. `agent.model_preference` config array (ordered failover, sampler-gated)
4. `sdk.buildAutoChain()` env-key scan
5. throw

`PROVIDER_KEYS` and `PROVIDER_DEFAULTS` come from acptoapi — never maintained in freddie. `sdk.chat()` returns OpenAI `{choices:[{message}]}`; `sdkChat()` adapter in llm_resolver converts to freddie's `{content, tool_calls, raw}`.

`agent.model_preference: []` in `~/.freddie/config.yaml` is an array of `{ provider, model? }` objects; `resolveCallLLM` tries each in order, skipping unavailable (sampler-gated) and marking failures with backoff.

`src/agent/acptoapi-bridge.js` `max_tokens` defaults to 4096 — never lower. 1024 silently truncates generation tasks.

`src/agent/llm_resolver.js::acpChat()` speaks the kilo ACP protocol: POST `/session` → GET `/event` (SSE) → POST `/session/<id>/message`. Streams `message.part.updated` events to assemble content; terminates on `session.idle`. **`/event` must be opened BEFORE `/message` POST or messages drop.** `ACP_BACKENDS`: kilo on `http://localhost:4780`, opencode on `http://localhost:4790`. kilo + opencode ACP backends return content only, no tool_calls — for multi-iteration tool-using loops, use OpenAI-compatible providers (mistral, openrouter, sambanova, groq).

## Plugin architecture

Every tool, platform, memory provider, GUI route, and core subsystem is a plugin under `plugins/<name>/`. There is no `src/tools/registry.js`, `src/tools/<tool>.js`, `src/gateway/platforms/*.js`, or `src/plugins/memory/*.js` — do not reach for those paths.

Contract: `{ name, version?, surfaces: 'pi'|'gui'|'both', requires?: [...names], register(ctx) }` — defined in `src/host/contract.js`.

- PI_VERBS: `tool, env, command, cron, platform, memory, skill, context, agentExt, cli`
- GUI_VERBS: `route, page, nav, debug, api, asset`
- HOOK_NAMES: `preToolCall, postToolCall, preLlmCall, postLlmCall, onSessionStart, onSessionEnd, onTurnStart, onTurnEnd, onMessageInbound, onMessageOutbound`
- Surface guard throws `plugin <name>: surface verb '<verb>' not allowed` at load.
- `requires` cycles throw `plugin cycle: a -> b -> a` synchronously.

Host: `src/host/host.js` — `createHost({surfaces, configStore, env})` + `discoverPlugins(roots)`. Singleton in `src/host/index.js`: `host()`, `bootHost(extraRoots)`, `resetHostForTests()`. Roots walked: `<repo>/plugins`, `~/.freddie/plugins/`, `<cwd>/.freddie/plugins/`.

`register(ctx)` receives `{ pi, gui, hooks, log, config, host, env }`:
- `log` — scoped JSONL with plugin name
- `config` — scoped under `plugins.<name>` (`get/set/all`)
- `host` — `{plugins(), get(name)}`

Thin shims (resolved through host, do not bypass): `src/plugins/manager.js`, `src/web/server.js` (iterates `host.gui.routes.list()`), `bin/freddie.js` (iterates `host.pi.cli.list()`), `src/gateway/platforms.js` (`*Adapter$` name match), `src/plugins/memory/provider.js` (host-router).

## gm-skill plugin

`plugins/gm-skill/plugin.js` registers ONE canonical skill named `gm-skill`. Resolution order: (1) `~/.claude/skills/gm-skill/SKILL.md`, (2) `node_modules/gm-cc/skills/gm-skill/SKILL.md`. All other `gm-*` platform variants (gm-cc, gm-codex, gm-cursor, gm-jetbrains, gm-kilo, gm-oc, gm-vscode, gm-zed, gm-gc, gm-copilot-cli) are DEPRECATED — do not register them. `src/host/host_helpers.js::loadCcFromNodeModules` carries `CC_EXCLUDE = new Set(['gm-cc'])` so the gm-cc npm package is not auto-discovered as a cc-plugin. test.js asserts exactly one gm-prefixed skill is registered, named `gm-skill`.

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

Build: `node scripts/build.mjs` in `C:/dev/anentrypoint-design` emits `dist/247420.js` + `dist/247420.css`. Rebuild after SDK edits or `component is not a function` kills mount silently. `server.js` serves SDK from `node_modules/anentrypoint-design/dist/`.

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
src/agent/machine.js             # xstate turn machine + writeTrajectory
src/agent/llm_resolver.js        # thin shim over acptoapi.chat
src/agent/acptoapi-bridge.js     # HTTP passthrough to FREDDIE_LLM_URL daemon
src/agent/model-discovery.js     # claude-cli/ACP/ollama discovery beyond acptoapi
src/agent/model-matrix.js        # MATRIX_FILE path + matrixUsable predicate
src/agent/pi-bridge.js           # @mariozechner/pi-ai callLLM adapter
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
src/plugins/manager.js           # thin shim over host
src/plugins/memory/provider.js   # host-router
src/skills/index.js              # SKILL.md loader
src/skin/engine.js               # _BUILTIN_SKINS + load/get/set
src/observability/log.js         # structured logs
src/observability/debug.js       # /debug registry
src/host/{contract,host,host_helpers,index}.js  # plugin contract + discovery + singleton
plugins/<name>/{plugin,handler}.js               # ~150 plugins: tools, platforms, memory, gui, core
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

One `test.js` at project root. ≤200 lines. Plain assertions, real data, real services. No mocks. No fixtures. No `tests/` dir. New behavior extends `test.js`, not a new test file.

test.js can pass while the CLI is broken — exercise every cli verb that wraps async-API modules (sessions, cron) explicitly, or smoke `node bin/freddie.js <verb>` after changes.

On Windows, test.js must call `closeDb()` and log-stream `closeAll()` before exit, otherwise libuv handle teardown crashes the process.

## Substrate gotchas

- `pi-coding-agent` ships a photon-rs wasm; install needs network.
- `pi-ai` reads provider keys via `findEnvKeys` / `getEnvApiKey`. Match its env var names (`ANTHROPIC_API_KEY`, etc.).
- **libsql async debt**: every call into `src/sessions.js` (listSessions/search/getMessages/createSession/appendMessage) and `src/cron/scheduler.js` (listJobs/createJob/cancelJob/deleteJob) must be `await`ed. Sync callsites silently wrap each call in a Promise that rejects on iteration, surfacing as `TypeError: ... is not iterable`. Tool ACTIONS inner functions are async; handlers await dispatched fn.
- **Bulk-rename: git grep is case-sensitive on literal patterns**: `git grep -lI <name>` only matches lowercase. For case-variant sweep, use `git grep -liI -e <lower> -e <Title> -e <UPPER>`. Single-form check is a false-clean trap.
- **codeinsight `🔐 hardcoded secrets` / `🔐 SQL injection` are regex-only**, not value/AST. False positives: env-var names like `DAYTONA_API_KEY` in `process.env.X` references; function param names like `secret` in HMAC helpers; URL query keys like `?appkey=&appsecret=`; HTTP `DELETE` URL paths flagged as SQL `DELETE FROM`. Always read the actual line before treating as a finding.
- **codeinsight orphan detector misses three reachability paths**: (1) `await import('./path/' + variable + '.js')` dynamic strings (test.js enumerates 10 agent adapters this way); (2) plugin auto-discovery walking `plugins/<dir>/plugin.js` from `discoverPlugins()` in `src/host/host.js`; (3) HTTP-served static files like `src/web/app.js` referenced only from `src/web/index.html`. Exempt these before deleting "dead" files.
- **freddie exec Windows invocation**: `bun run bin/freddie.js exec --prompt "..."`. Do NOT use `bun x freddie` — hangs on Windows from npm registry fetch timeouts. Args: `--prompt` (required), `--model` (default ''), `--timeout` (default 60000ms). Validated CI entry point.
- **GitHub Actions `deploy-pages@v5`**: rejects if 2+ artifacts named "github-pages" exist. `gh run rerun --failed` can silently re-upload transients; trigger a fresh run via empty commit instead.
- **Rebase regression trap**: after `git pull --rebase` following a rejected push, a CI auto-bump commit on remote can revert local fixes. `.github/workflows/restore-package.cjs` pins anentrypoint-design via `npm view` + `^<latest>`; `publish.yml` runs `npm install --package-lock-only` to keep lockfile valid. Recurrence tell: if pages CI fails with `lock file's anentrypoint-design@X.Y.Z does not satisfy anentrypoint-design@` (empty version = file: dep), audit `restore-package.cjs` and `publish.yml` for reversion — do not manually re-pin in `package.json` forever.

## Subsystem guide

| Concern | Freddie location |
|---|---|
| Agent loop | `src/agent/machine.js` (xstate) + `@mariozechner/pi-agent-core` |
| CLI entry | `bin/freddie.js` (commander) + pi-coding-agent InteractiveMode |
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
| TUI | substrate (`pi-tui` + pi-coding-agent) |
| Plugins + memory | `src/plugins/manager.js` + `src/plugins/memory/provider.js` + `plugins/memory-*/` |
| Skills loader | `src/skills/index.js` — content drops into `~/.freddie/skills/` |
| Context compressor | `src/agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js` |
| Documentation site | `website/` (flatspace + content/pages/*.yaml + theme.mjs) |
| Cron scheduler | `src/cron/{scheduler,cron-parse}.js` (async API) |
| Batch runner | `src/batch.js` |
| Execution environments | `src/tools/environments/{local,docker,ssh}.js` (modal/daytona/singularity are explicit residual) |
| Dashboard | `src/web/{server,app,state,routes,index.html}` — thin mount over `anentrypoint-design` SDK |
| Auth store | `src/auth.js` (FileAuthStore) + pi-ai key resolution |
| Context engine | `src/context/engine.js` |
| Browser tool | `plugins/browser/` (puppeteer-core, lazy) |
| LLM resolver | `src/agent/llm_resolver.js` (thin shim over `acptoapi.chat`) |
| Bundled skills | `skills/` (5 categories) |
| Integration tests | one `test.js` at root |

## Cross-project Rust gotchas

rs-plugkit exec utility verbs + rs-exec timeout aliases — see rs-learn (recall "Freddie cross-project Rust gotchas").

## Plugsdk integration

- plugsdk publishes automatically to npm registry on push to main.
- Freddie installs plugsdk from registry, NOT via `file:` dep — a stale `"link": true` entry in package-lock.json blocks `npm ci`.
- `src/host/contract.js` re-exports `piAdapter`, `HookType`, `allowResult`, `blockResult`, `modifyResult` from plugsdk and uses `HookType` constants in `FREDDIE_TO_SDK_HOOK` mapping.

## opencode CLI shim

Windows: use the npm install (`opencode.cmd`), not the broken bun shim; ACP daemon on 4790 — see rs-learn (recall "Freddie opencode CLI shim Windows").

## scripts/sync-upstream.mjs

`node scripts/sync-upstream.mjs [--dry-run] [pkg ...]` bumps sibling dep entries (plugsdk, acptoapi, anentrypoint-design, gm-cc) in `package.json` to `^<latest>` from npm registry, then runs `npm install --package-lock-only`. Skips `file:` deps. Wired into `.github/workflows/sync-upstream.yml` (weekly cron + workflow_dispatch); opens a PR via `peter-evans/create-pull-request@v6` on changes.

## Trajectory recorder

`src/agent/machine.js::writeTrajectory()` writes one JSON per turn under `<FREDDIE_HOME>/trajectories/<ts>-<slug>.json` when `agent.save_trajectories=true` OR `--witness <path>` is set on `freddie exec`. Schema (`schema_version: 2`):

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
- `GET /api/models/availability` → full JSON (404 with `{error,hint}` if file absent)
- `GET /api/models/availability/summary` → `{timestamp, daemons, summary}` (truncated)
- `POST /api/models/availability/rebuild` → 202 `{ok, pid, jobId}` (spawns build; 409 if rebuild in flight)

Sampler integration: agent-loop failures feed acptoapi's per-provider backoff (5-step 30s→480s). Provider-scoped granularity only — per-(provider,model) would need an acptoapi sampler schema change.

## Website theme + YAML

- `website/theme.mjs` renders structured YAML via 247420 design vocabulary, not raw markdown. Consumes `page.hero` (heading/subheading/accent/body/badges/ctas), `page.sections[]` (rotating rail color green→purple→mascot→sun→flame→sky by section index, optional `lede` + per-item `benefit` italic), `page.examples[]` (railed link list with mono numeric ranks + ↗ glyph). Falls back to `page.body` markdown for prose. Style block inlined so rail/dot/chip/btn classes work without ds-247420 SDK CSS loading first. Prefer enriching hero+sections+examples over expanding body markdown.
- **YAML colon-space trap**: in `website/content/pages/*.yaml`, any value containing `: ` outside backticks (e.g. `[linux, macos, windows]`, `requiresEnv: ['MY_KEY']` snippets) MUST be double-quoted. The parser otherwise interprets the embedded colon as a mapping and the file fails to load.
- SSR innerHTML injection beats client dispatch for site pages — emit HTML with rail/dot/chip/btn classes + inline styles so it paints before the SDK loads.
