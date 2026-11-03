# Agent Note: Remove gm from freddie

Status: implemented

## Problem

Freddie integrated gm, its predecessor harness, through a spool client, a daemon-backed tool set, a progress projection and an Overview dock. gm-new is now the project's own tooling, and the gm daemon is no longer what freddie talks to. The gm-only packages still shipped in the default bundles, so every boot resolved them, the base bundle carried their dependencies, and every client carried their projection code.

## Decision

Freddie no longer contains gm. These are deleted:

- `packages/gm/` (`gm-client`, `gm-config`, `gm-progress`, `tool-gm`).
- `packages/web/web-search-browser/`, whose browser provider resolved through `ctx.gm`.
- `packages/bundle/dream-rsi/` and `packages/context/dream-rsi-context/`, which replayed gm receipts.
- `packages/client/ui-observability/`, the gm Overview dock. Its PRD and mutable graph came only from `gm/progress`.
- `.gm/instructions/hooks/`.

Wiring removed with them: the gm, tool-gm, gm-progress and web-search-browser rows and their `toolOrder` names in the `base`, `web-app` and `headless` bundles; the `browser-google` search pin; `DEFAULT_ON_BUNDLES` in `app-boot` reduced to `agent-team-profile`; the `gmProgress` projection, the `gm/progress` frame and the `gm.*` sentence in `client/connection`; the `gmProgress` header segment in `ui-artifacts`; the `ObservabilityDock` css-manifest entry; the gm mount in `packages/api/remotes`; the gm importers in `pnpm-lock.yaml`; and the gm block and `vendor/gm/` in `.gitignore`.

`.gitignore` keeps `/runs/`, `/.playwriter/` and `/.gm/locks/`, which the gm-new MCP runtime still writes in this checkout. The typert README points its hand-owned host-manifest example at `packages/api/remote-stream/src/typert.host.js`, which replaced the gm client's manifest as the example.

## Verification

- `node apps/cli/src/bin.js --profile headless "…"` composes the profile and resolves its plugins, then stops at `MISSING_CREDENTIAL: llm-deepseek` because `DEEPSEEK_API_KEY` is unset. That is the expected stop without a key.
- `--dump-config` for `headless` (13,257 bytes) and `web` (20,138 bytes) contains none of `dream-rsi`, `ui-observability`, `web-search-browser`, `gm-client`, `gm-progress`, `tool-gm`, `gm-config`, `gmProgress` or `gm_`.
- `node scripts/publint-all.js` lints 266 packages, 266 report "All good!", exit 0.
- A direct scan of every tracked text file, outside `.agents/notes/`, `work/`, `DESIGN-LOG` and `.gm/`, finds none of the removed names (3,367 files read, 0 hits). The lockfile has no `packages/gm`, `dream-rsi`, `ui-observability` or `web-search-browser` line.

## Alternatives considered

**Keep gm behind an opt-in profile.** Rejected: the packages depend on the gm daemon's spool, and gm-new is the tool now. An opt-in profile keeps the dependency graph, the lockfile importers and the projection code in every checkout for no shipped user.

**Keep `tool-gm` and `gm-client` as deprecated shims.** Rejected: `AGENTS.md` prefers the correct foundation over compatibility shims, and a shim with no backend would answer every call with an error.

**Keep the Overview dock on another data source.** Rejected: the dock had no non-gm data source, so it would render empty.

**Keep `web-search-browser` with another provider.** Rejected: its browser provider was gm-backed. Replacing it is new work, not removal.

## Consequences

Given up:

- The base bundle mounts no search provider. `web_search` fails with `WEB_PROVIDER_UNAVAILABLE` until one of `exa`, `deepseek` or `perplexity` is configured. This follows from removing the rows; it was not exercised live.
- The Overview tab and the gm dock are gone from the web client.
- Dream replay (`gm_dream_replay`) is gone.
- Profiles that list `@freddie/freddie-dream-rsi` or another removed package fail to load. Profile normalization rewrites only old tuples, and the pre-release stance adds no migration. Those profiles must drop the rows.

Bought: boot and publint no longer resolve or lint gm-only packages, and the lockfile loses their importers.

Historical notes: 23 active implemented notes still name removed packages. Each records a shipped decision that no longer exists, so treat each as a historical record, not current authority. Archiving or consolidating them is a separate decision.

- [gm-config readonly resolver](../architecture/2026-09-07-gm-config-readonly-resolver.md)
- [never-restart HMR](../architecture/2026-09-09-never-restart-hmr.md)
- [gm daemon recovery](../architecture/2026-09-11-gm-daemon-recovery.md)
- [live process observability](../architecture/2026-09-11-live-process-observability.md)
- [grounded dream-rsi replay](../architecture/2026-09-17-grounded-dream-rsi-replay.md)
- [gm step latency hot path](../architecture/2026-09-19-gm-step-latency-hot-path.md)
- [durable conversation artifacts and memory](../architecture/2026-09-21-durable-conversation-artifacts-and-memory.md)
- [ptc chain not ported](../architecture/2026-09-28-ptc-chain-not-ported.md)
- [gm spool wait rejection ownership](../architecture/2026-10-06-gm-spool-wait-rejection-ownership.md)
- [composer and chat seat witnesses](../architecture/2026-10-13-composer-and-chat-seat-witnesses.md)
- [fixture gm and terminal drivers](../architecture/2026-10-13-fixture-gm-and-terminal-drivers.md)
- [gm inflight busy until hung abort](../bug-fix/2026-09-07-gm-inflight-busy-until-hung-abort.md)
- [gm client native spool boot](../bug-fix/2026-09-10-gm-client-native-spool-boot.md)
- [gm residual scan tool](../bug-fix/2026-09-11-gm-residual-scan-tool.md)
- [gm response file completion and dead daemon replay](../bug-fix/2026-09-11-gm-response-file-completion-and-dead-daemon-replay.md)
- [gm overview mutable graph](../feature/2026-04-15-gm-overview-mutable-graph.md)
- [gm native tool presenters and abort](../feature/2026-09-06-gm-native-tool-presenters-and-abort.md)
- [browser-use provider registry](../feature/2026-09-27-browser-use-provider-registry.md)
- [outbound http proxy support](../feature/2026-09-27-outbound-http-proxy-support.md)
- [api controllers session terminal job](../feature/2026-09-28-api-controllers-session-terminal-job.md)
- [compaction image offload](../feature/2026-09-28-compaction-image-offload.md)
- [gm runtime update projection](../feature/2026-10-02-gm-runtime-update-projection.md)
- [gm causal operations observability](../feature/2026-10-11-gm-causal-operations-observability.md)
