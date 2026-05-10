# Freddie

An open JS agent harness built on pi-mono, xstate, floosie, and anentrypoint-design. Features a full gateway, context compressor, multi-platform adapters, and a live dashboard — built with:

- [`@mariozechner/pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) — agent + tools + interactive TUI substrate
- [`@mariozechner/pi-agent-core`](https://www.npmjs.com/package/@mariozechner/pi-agent-core) — agent loop primitives
- [`@mariozechner/pi-ai`](https://www.npmjs.com/package/@mariozechner/pi-ai) — provider abstraction (Anthropic / OpenAI / Groq / …)
- [`@mariozechner/pi-tui`](https://www.npmjs.com/package/@mariozechner/pi-tui) — TUI primitives
- [`floosie`](https://www.npmjs.com/package/floosie) — gateway stream pipeline (xstate-backed)
- [`xstate`](https://www.npmjs.com/package/xstate) — agent turn machine + lifecycle state machines
- [`anentrypoint-design`](https://www.npmjs.com/package/anentrypoint-design) — webjsx + ripple-ui design system (replaces React for the dashboard)
- [`flatspace`](https://www.npmjs.com/package/flatspace) — flat-file CMS + static site builder (powers the `website/` documentation site)

See [AGENTS.md](./AGENTS.md) for the full subsystem guide and residual complement.

## Install

```sh
cd c:/dev/freddie
npm install
```

## Use

```sh
# List tools (>=11 registered)
node bin/freddie.js tools

# All slash-style commands
node bin/freddie.js help-all

# Interactive REPL (skin-aware, slash commands routed via registry)
node bin/freddie.js run

# Run a single prompt non-interactively (exits after response)
node bin/freddie.js exec --prompt "list 3 penguin species"

# Profile management (~/.freddie/profiles/*)
node bin/freddie.js profile list
node bin/freddie.js profile create coder
node bin/freddie.js profile switch coder

# Skin engine (default | ares | mono | slate)
node bin/freddie.js skin
node bin/freddie.js skin ares

# Sessions and search
node bin/freddie.js sessions
node bin/freddie.js search "<query>"

# Cron scheduler (persistent jobs in SQLite)
node bin/freddie.js cron list
node bin/freddie.js cron add "*/5 * * * *" "summarize my email"
node bin/freddie.js cron tick

# Batch runner (parallel runs, JSONL output)
node bin/freddie.js batch prompts.txt --concurrency 4

# Web dashboard (express + anentrypoint-design webjsx)
node bin/freddie.js dashboard --port 3000

# Gateway (webhook + api_server + 16 platform adapters)
node bin/freddie.js gateway --port 3000

# ACP server (JSON-RPC over stdio for IDE integrations)
node bin/freddie.js acp
```

## Tools

70 built-in tools auto-discovered from `plugins/*/`. Core set: `bash`, `read`, `write`, `edit`, `grep`, `todo`, `memory`, `delegate`, `web_search`, `image_gen`, `browser`.

## Platforms

`plugins/platform-*/`: webhook, api_server, telegram, discord, slack, whatsapp, signal, matrix, mattermost, email, sms, dingtalk, wecom, weixin, feishu, qqbot, bluebubbles, homeassistant. Each adapter exposes `getRequiredEnv()` and throws clear messages when credentials are absent.

## Memory providers

`plugins/memory-*/`: honcho, mem0, supermemory, byterover, hindsight, holographic (local-FS), openviking, retaindb. Set `memory.provider` in `~/.freddie/config.yaml` and the corresponding `*_API_KEY`.

## Plugin compatibility

Freddie accepts three plugin shapes:

- **Native**: `{ name, surfaces, register(ctx) }` — the standard freddie contract
- **plugsdk** (`definePlugin()` format): `{ name, tools, hooks, meta }` — auto-detected and wrapped by `wrapPlugsdkPlugin()` in `src/host/host.js`
- **gm-cc**: installed as `gm-cc` npm dep; `plugins/gm-cc/plugin.js` discovers and registers all 12 SKILL.md files under the `gm:*` namespace in `pi.skills`

[`plugsdk`](https://www.npmjs.com/package/plugsdk) is an npm dependency (`^1.0.7`). `src/host/contract.js` re-exports `definePlugin`, `HookType`, `allowResult`, `blockResult`, `modifyResult`, `PluginRunner`, `PluginRuntime`, and `piAdapter` from it. `FREDDIE_TO_SDK_HOOK` maps freddie hook names to `HookType.*` constants (e.g. `HookType.PRE_TOOL_USE`).

plugsdk adapters: freddie/pi, MCP, OpenAI, LangChain, Cursor/VSCode, Aider (9 adapters total).

## Layout

```
freddie/
├── bin/freddie.js                  # commander CLI: tools, skills, profile, skin, sessions, search, gateway, acp, run, cron, batch, dashboard, help-all
├── src/
│   ├── home.js                   # getFreddieHome + profiles
│   ├── config.js                 # YAML + migrations
│   ├── sessions.js               # SQLite + FTS5
│   ├── auth.js                   # FileAuthStore (~/.freddie/auth/)
│   ├── batch.js                  # parallel batch runner
│   ├── tools/                    # registry + environments/ (tools now in plugins/*/)
│   ├── toolsets.js
│   ├── agent/{machine,pi-bridge}.js   # xstate turn machine + pi-ai bridge
│   ├── commands/{registry,profile}.js # CommandDef + CRUD
│   ├── cli/interactive.js        # readline REPL
│   ├── context/engine.js         # pluggable context blocks
│   ├── cron/{scheduler,cron-parse}.js
│   ├── web/{server,index.html}   # dashboard
│   ├── gateway/                  # Gateway (platform adapters now in plugins/platform-*/)
│   ├── acp/server.js             # JSON-RPC stdio
│   ├── plugins/                  # PluginManager + 8 memory backends
│   ├── skills/index.js           # SKILL.md loader
│   ├── skin/engine.js            # 4 built-in skins, YAML user-skins
│   └── observability/            # structured logs + /debug
│   └── agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js  # context compressor
├── skills/                       # bundled SKILL.md (creative, software-development, ops, data, planning)
├── website/                      # flatspace-powered docs site (content/pages/*.yaml + theme.mjs)
├── AGENTS.md
├── CHANGELOG.md
└── test.js                       # 12 named groups, ≤200 lines, real services
```

## Status

v0.1.1 complete and witnessed: 12/12 named tests passing, dashboard + website both live-witnessed via headless browser.

- 16 gateway platforms with functional wire-format code (no throwing stubs)
- 8 memory providers call real endpoints (or local-FS for `holographic`)
- 11 built-in tools (bash/read/write/edit/grep/todo/memory/delegate/web_search/image_gen/browser)
- Cron scheduler, parallel batch runner, auth store, context-engine, pi-ai bridge, interactive REPL
- **Full context compressor** (`src/agent/compress/*`) with handoff-framed summary prefix, structured summarizer prompt, head/middle/tail policy, tool-output pre-pruning, summary-budget ratio, iterative summary update, and 600s failure cooldown
- **Documentation site** at `website/` powered by `flatspace` (NOT docusaurus). Build with `cd website && node ../node_modules/flatspace/bin/flatspace.js build` — output to `website/docs/` for GitHub Pages.

**LLM providers**: anthropic, openai, groq, openrouter, cerebras, google, mistral, codestral, cloudflare-workers-ai, xai, zai, opencode, nvidia, sambanova, qwen — plus acptoapi localhost bridge. Set `agent.model_preference` in `~/.freddie/config.yaml` for ordered failover with exponential backoff.

What's not in the box yet (residual, see AGENTS.md): real credentials per platform / memory backend; modal / daytona / singularity environments; bedrock / codex provider adapters.

## Testing

```sh
node test.js
```

One integration test at root, ≤200 lines, plain assertions, real services. No fixtures, no mocks. Dashboard validation also runs through a live `exec:browser` witness during EMIT/VERIFY.
