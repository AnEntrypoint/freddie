# Changelog

## [0.1.2] - 2026-05-04

### Verified
- gm-cc plugin integration complete: 12 SKILL.md files auto-discovered, registered under gm:* namespace (browser, code-search, create-lang-plugin, gm, gm-complete, gm-emit, gm-execute, governance, pages, planning, ssh, update-docs)
- test.js assertion added to host+tools+toolsets group: confirms ≥12 gm:* skills present with correct names; test.js 200 lines exactly, all 12 groups passing

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
