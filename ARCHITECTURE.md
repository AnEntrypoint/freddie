# Architecture map

One page, high level. Detailed subsystem/gotcha docs live in AGENTS.md — this file is only the map.

## What this repo owns

Freddie is the LLM-facing agent runtime: tool execution (`plugins/*`, `src/tools/`), sessions,
providers/model resolution, cron/scheduler, gateways (Discord, webhook, etc.), and — critically —
`acptoapi`, an OpenAI-compatible HTTP surface (`/v1/chat/completions`) that is **the only sanctioned
entry point** into freddie's runtime for other layers of the stack. It also ships a standalone web
GUI (`src/web/app.js`) and a CLI/TUI (`src/cli`, `src/pi`).

Freddie does **not** own visual/GUI component code — that lives entirely upstream in
`anentrypoint-design` and is consumed here as a normal npm dependency.

## How it fits with design and thebird

```
design (npm dep) --> freddie --exposes acptoapi HTTP--> thebird (calls acptoapi, never freddie
                        |                                 directly; never talks to LLM providers
                        `--gm-learn.js browser bridge-->   itself)
```

- **design** is consumed as a plain npm dependency for the GUI: `src/web/app.js` is a thin mount
  around design's `createFreddieDashboard`/`AppShell`, so freddie's own web UI and thebird's
  embedded `assistant` app render the exact same dashboard component tree.
- **thebird** never imports freddie or fetches an LLM provider directly — the dynamic-stack
  contract is: thebird → acptoapi (HTTP) → freddie → provider. Freddie's browser-side learning
  bridge (`src/learn/gm-learn.js`) is env-aware and lazy: on gh-pages (no `node:module`), it
  probes for `globalThis.__GM_DISPATCH__`/`__GM_NAMESPACE__`, which thebird's `docs/freddie-host.js`
  sets up — that is the one place freddie code runs assuming a browser host rather than Node.
  Freddie itself must never assume thebird's existence; the coupling is one-directional.
- `plugins/` is the extension surface (bash, code execution, MCP tool bridge, terminal, Discord
  gateway, gm-skill, etc.) — discovered dynamically at boot, not statically imported.

## Boot / build sequence

**Dev:** `npm install`, then run via the CLI entrypoint or `node -e "import('./src/index.js')..."`
for programmatic use. Plugins are discovered from `plugins/` (and any additional roots) at host
creation time via `discoverPlugins()` in `src/host/host.js` — each `plugins/<name>/{plugin.js|
handler.js}` is dynamically `import()`ed, so adding a plugin is a directory-add, not a registration
edit.

**acptoapi**: booted via `bunx acptoapi@latest` (or as a library) — binds `:4800`, autolaunches ACP
daemons, exposes `/v1/chat/completions` plus a response cache and optional idle pretest. This is
the process thebird's `docs/acptoapi-integration.md` external-mode config points at.

**Build/publish**:
- `browser-bundle.yml` — builds a browser bundle (`npm run build:browser`) and skills manifest,
  publishes to `gh-pages` under `/browser/`.
- `pages.yml` — builds the marketing/docs website (`website/`, via flatspace) and folds the browser
  bundle + skills into the same Pages artifact.
- `publish.yml` — on push to `master`: prepares `package.json`, installs, runs `node test.js`,
  `npm publish`, then restores/commits the version bump.
- `test.yml` (CI, every push/PR): `node test.js` unit tests plus a plugin-discovery smoke boot
  (`discoverPlugins(['plugins'])` must not throw) — runs on PRs too, unlike `publish.yml` which
  only gates the real npm publish.
