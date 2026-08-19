# ƒreddie

An open JS agent harness built on xstate and anentrypoint-design. Features a full gateway, context compressor, multi-platform adapters, and a live dashboard — built with:

- [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai) — provider abstraction (Anthropic / OpenAI / Groq / …)
- [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui) — TUI primitives
- [`xstate`](https://www.npmjs.com/package/xstate) — agent turn machine + lifecycle state machines
- [`anentrypoint-design`](https://github.com/AnEntrypoint/design) — webjsx + ripple-ui design system (replaces React for the dashboard)
- [`acptoapi`](https://github.com/AnEntrypoint/acptoapi) — the LLM SDK: chain fallback, sampler backoff, matrix-aware scoring (see AGENTS.md's "acptoapi is THE SDK")
- [`plugsdk`](https://github.com/AnEntrypoint/plugsdk) — plugin contract types consumed by `src/host/contract.js`
- [`flatspace`](https://www.npmjs.com/package/flatspace) — flat-file CMS + static site builder (powers the `website/` documentation site)

`@earendil-works/pi-coding-agent` and `@earendil-works/pi-agent-core` are **not** dependencies — freddie's agent loop, session store, and plugin system are original code, not thin wrappers over that package (see AGENTS.md's "Substrate" section for the full rationale). `floosie` is not currently a dependency either, and is not imported anywhere in `src/`.

See [AGENTS.md](./AGENTS.md) for the full subsystem guide and residual complement — it is the maintained source of truth; this file gives a lighter overview and defers to it on any conflict.

## Install

```sh
git clone https://github.com/AnEntrypoint/freddie.git
cd freddie
npm install
```

## Use

```sh
# List tools (live-registered count, see the Tools section below)
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

# Gateway (webhook, api_server, and every plugins/platform/ adapter — see the Platforms section below)
node bin/freddie.js gateway --port 3000

# ACP server (JSON-RPC over stdio for IDE integrations)
node bin/freddie.js acp
```

## Tools

Built-in tools auto-discovered from `plugins/*/` (core set under `plugins/tools/` and `plugins/core/`: `bash`, `read`, `write`, `edit`, `grep`, `todo`, `memory`, `delegate`, `web_search`, `image_gen`, `browser`, among others). Run `node bin/freddie.js tools` for the exact live-registered list and count — it changes as plugins are added, so this file does not pin a number.

## Platforms

`plugins/platform/platform-<name>/`, one directory per platform, plus a consolidated `platform-providers` plugin (`plugins/platform/platform-providers/`) covering `webhook`/`mattermost`/`qqbot`/`bluebubbles`/`sms`/`email` in one registration point. Current adapters: `api_server`, `dingtalk`, `discord`, `feishu`, `homeassistant`, `matrix`, `signal`, `slack`, `telegram`, `wecom`, `weixin`, `whatsapp`, `yuanbao` (standalone) plus `webhook`, `mattermost`, `qqbot`, `bluebubbles`, `sms`, `email` (consolidated). Each adapter exposes `getRequiredEnv()` and throws clear messages when credentials are absent.

## Memory providers

`plugins/memory/memory-providers/` (one consolidated plugin): `honcho`, `mem0`, `supermemory`, `byterover`, `hindsight`, `openviking`, `retaindb` (all thin REST wrappers over a shared factory), plus `holographic` (local-FS, no network). Set `memory.provider` in `~/.freddie/config.yaml` and the corresponding `*_API_KEY`. Note: this is a legacy opt-in surface — freddie's own agent memory runs through gm rs-learn (see AGENTS.md's "Learning" section), not these providers.

## Plugin compatibility

Freddie accepts two plugin shapes:

- **Native**: `{ name, surfaces, register(ctx) }` — the standard freddie contract (`src/host/contract.js`)
- **plugsdk** (`definePlugin()` format): `{ name, tools, hooks, meta }` — auto-detected and wrapped by `wrapPlugsdkPlugin()` in `src/host/host.js`

`plugsdk` is installed via `github:AnEntrypoint/plugsdk` (default branch, no version pin — see AGENTS.md's Versioning section, not a semver range). `src/host/contract.js` re-exports `HookType` from it and uses `HookType` constants in the `FREDDIE_TO_SDK_HOOK` mapping, alongside its own `definePlugin`/`PluginRunner`/`PluginRuntime`/`validatePlugin`/`topoSort`.

The `gm-skill` skill is loaded directly from its `SKILL.md` (not registered as a plugin); the older `gm-cc` plugin path is deprecated and excluded from auto-discovery — see AGENTS.md's "gm-skill" section.

## Layout

```
freddie/
├── bin/freddie.js       # commander CLI: tools, skills, profile, skin, sessions, search, gateway, acp, run, cron, batch, dashboard, help-all
├── src/                 # agent loop, sessions, config, host/plugin system — see AGENTS.md's Layout table for the full file map
├── plugins/<name>/{plugin,handler}.js   # ~100 plugins: tools, platforms, memory, gui, core (see AGENTS.md's Plugin architecture)
├── skills/              # bundled SKILL.md (creative, software-development, ops, data, planning)
├── website/             # flatspace-powered docs site (content/pages/*.yaml + theme.mjs)
├── AGENTS.md             # the maintained subsystem guide — authoritative on any conflict with this file
└── CHANGELOG.md
```

AGENTS.md's own Layout section is kept current as part of freddie's development workflow; this file intentionally does not duplicate it file-by-file.

## Status

- Every gateway platform routes through real webhook/REST wire code (no throwing stubs); see the Platforms section above for the current list.
- Memory providers call real endpoints (or local-FS for `holographic`); freddie's own agent memory runs separately through gm rs-learn.
- Cron scheduler, parallel batch runner, auth store, context engine, pi-ai bridge, interactive REPL + from-scratch pi-tui-based TUI.
- **Context compressor** (`src/agent/compress/*`) with handoff-framed summary prefix, structured summarizer prompt, head/middle/tail policy, tool-output pre-pruning, summary-budget ratio, iterative summary update, and failure cooldown.
- **Documentation site** at `website/`, powered by `flatspace` (not docusaurus). Build with `cd website && node ../node_modules/flatspace/bin/flatspace.js build` — output to `website/docs/` for GitHub Pages.
- Current package version: see `package.json`; history lives in `CHANGELOG.md`, not in this file.

**LLM providers**: routed entirely through `acptoapi` (see AGENTS.md's "acptoapi is THE SDK") — anthropic, openai, groq, openrouter, cerebras, google, mistral, codestral, cloudflare-workers-ai, xai, zai, opencode, nvidia, sambanova, qwen, and more, plus the acptoapi localhost bridge. Set `agent.model_preference` in `~/.freddie/config.yaml` for ordered failover with exponential backoff.

**Model availability matrix**: `scripts/build-model-availability.js` cross-probes every (provider × model × access_mode) cell across 7 modes (`direct_api`, `acptoapi_passthrough`, `freddie_v1`, `kilo_acp`, `opencode_acp`, `claude_cli`, `freddie_agent_loop`). Sampler-aware on both `probeDirect` and `probeAgentLoop` — failures feed acptoapi's per-provider exponential backoff (5-step 30s→480s). Output: `.gm/model-availability.json` with `{timestamp, config, daemons, providers[].models[].modes{}, sampler, summary}`. Dashboard endpoints in `plugins/gui/gui-models-discover/plugin.js`: `GET /api/models/availability` (full JSON or 404), `GET /api/models/availability/summary` (timestamp+daemons+summary only), `POST /api/models/availability/rebuild` (202 background spawn). See AGENTS.md for full schema + skipped-reason taxonomy.

What's not in the box yet (residual, see AGENTS.md): real credentials per platform / memory backend; some execution environments (modal / daytona / singularity are explicit residual in `src/tools/environments/`).

## Testing

**No automated test suite — zero, by design.** There is no test framework, test runner, test directory, or `test` script in `package.json`. Verification is running the real code path live and reading the real output: `node bin/freddie.js exec --prompt "..."`, `node bin/freddie.js dashboard`, or the `exec_js`/`browser` tool during development. See AGENTS.md's "Testing" section for the full rationale.
