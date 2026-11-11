# Pending validation: reduction to what the system needs

Peer: reduction run `2026-11-11-14-21-52-530d6d`. Runner: `runs/analysis/baseline.mjs <label>` (untracked), one line per check.

## What "the system functioning" means

Derived from `AGENTS.md`, `README.md`, `docs/development.md`, root `package.json`, `pnpm-workspace.yaml`, `apps/cli`, `apps/web` and `.github/workflows/publint.yml`. The workspace is buildless and has no automated test suite, so "builds" is install plus publish-shape, and "tests" is live boots.

1. `pnpm install --frozen-lockfile` succeeds (CI step).
2. `pnpm run publint` passes (the only CI check).
3. `pnpm run verify-third-party-notices` and `pnpm run rescope-vendor:check` (package.json checks).
4. `node scripts/release/verify.js --family freddie|vendor` resolves a publish order.
5. `pnpm freddie --help` and `--version` answer.
6. `pnpm freddie --profile web|headless|acp|sdk --dump-default-config` compose the four in-box profiles.
7. `pnpm freddie --profile headless "task"` boots to the model call (no `DEEPSEEK_API_KEY` exists on this host, so the witness is the `MISSING_CREDENTIAL` gate).
8. `pnpm freddie --profile acp` and `--profile sdk` answer a JSON-RPC `initialize` on stdio.
9. `pnpm freddie web --no-open` serves `/` with every script, stylesheet and import-map URL answering 200, and the page renders in a browser with no console error or failed request.
10. `pnpm run demo:acp`, `demo:cordis` (web and acp) and `demo:code-mode` boot.
11. Every workspace package's main entry imports under plain `node`.

## Baseline before removal (commit a2a703ae, node v24.22.0, pnpm 11.7.0)

| Check | Result | Wall time |
|---|---|---|
| install | pass | 1050 ms |
| publint | pass, 266 packages | 3573 ms |
| third-party-notices | broken before: `ENOENT` on `@anthropic-ai/claude-agent-sdk-linux-x64/package.json` in the pnpm store | 1713 ms |
| rescope-vendor-check | broken before: exact edit `root-agents-vendored-name-contract` no longer matches `AGENTS.md` | 1986 ms |
| release-verify-freddie | pass, 263 members | 169 ms |
| release-verify-vendor | pass, 10 members | 113 ms |
| cli-help | pass, `0.1.1-rc.2` | 266 ms |
| dump-web | pass, md5 ec3165180a7193232905f7b115d1786b | 408 ms |
| dump-headless | pass, md5 6067aa2192eaff47da8de1ae597d9882 | 365 ms |
| dump-acp | pass, md5 4668262cf13066c3639e2a376b48de81 | 330 ms |
| dump-sdk | pass, md5 fe0324ee81713a18fc899c0c1818a508 | 359 ms |
| headless-no-key | pass, `MISSING_CREDENTIAL` gate reached | 2388 ms |
| acp-initialize | pass, `agentInfo.name` `freddie-acp` | 1298 ms |
| sdk-initialize | answers; the reply is the error `paths[0] must be of type string` (broken before for a bare `initialize`) | 1112 ms |
| demo-acp | pass | 652 ms |
| demo-cordis-acp | pass | 635 ms |
| demo-code-mode | pass | 715 ms |
| web-boot | pass, `GET /` 200, 260 assets 200, 0 bad | 1826 ms |
| web-browser | pass, title `freddie`, 462 nodes, 0 console errors, 0 failed requests | 24.9 s job |
| demo-cordis-web | broken before: `scripts/demo-cordis.mjs` passes `web --patch`, which the CLI rejects (`unknown option '--patch'`) | 60124 ms (timeout) |
| import-smoke | 277 packages, 275 ok; `freddie-client-web` and `freddie-client-ui-primitives` fail before (browser-only entries) | 3875 ms |
| migrate:packed-session-fixtures | broken before: `Cannot find package '@freddie/freddie-session'` from `scripts/` | under 1 s |

Whole baseline: 91.6 s. Tree before: 4361 tracked files, 13 554 902 bytes. Dependency set before: 510 lockfile packages, 284 importers, 419 `node_modules/.pnpm` entries, `node_modules` 283 020 191 bytes.

## Phase A pending lines

Each removal group needs the whole list above rerun on the final tree; a check that passed before must pass after.

| Group (commit) | Witness it needs |
|---|---|
| stale root files and work rows (6d02d01c) | whole list |
| unused scripts, `.github/issue-management` (6bf31bf9, bbab8ff8) | publint, release-verify, demo-cordis-web |
| example leaves nothing starts (83417305) | demo-acp, demo-cordis-acp, demo-code-mode, demo-cordis-web |
| 29 unreachable packages (e26b233a) | install, publint, release-verify, four profile dumps identical, all boots, import-smoke |
| unimported source files (eb1a4691) | web-boot, web-browser, import-smoke |
| unused dependencies and lockfile (ecfd2b50) | install, third-party-notices, all boots |
| unlinked notes and pages (4933f3b0), doc repair (7997b37b) | no kept document outside Agent Notes links to a removed file |
| notices regenerated, rescope check repaired (0ee2ac5f) | third-party-notices, rescope-vendor-check |
| unreferenced exports (b60cd23b) | publint, all boots, web-browser, import-smoke |

## Phase B on the final tree (commit 7997b37b)

| Check | Before | After | Wall time after |
|---|---|---|---|
| install | pass | pass | 4307 ms |
| publint | pass, 266 packages | pass, 237 packages | 5699 ms |
| third-party-notices | broken | pass, up to date | 1788 ms |
| rescope-vendor-check | broken | pass, post-state verified | 6844 ms |
| release-verify-freddie | pass, 263 members | pass, 234 members | 144 ms |
| release-verify-vendor | pass, 10 members | pass, 10 members | 66 ms |
| cli-help | pass | pass | 178 ms |
| dump-web, dump-headless, dump-acp, dump-sdk | pass | pass, byte-identical to before | 842, 181, 181, 212 ms |
| headless-no-key | `MISSING_CREDENTIAL` gate | same | 4431 ms |
| acp-initialize | pass | pass | 1530 ms |
| sdk-initialize | `paths[0]` error reply | same reply (not caused by the removal; left as found) | 1108 ms |
| demo-acp, demo-cordis-acp, demo-code-mode | pass | pass | 1146, 3097, 10900 ms |
| web-boot | 200, 260 assets | 200, 260 assets, 0 bad | 3889 ms |
| web-browser | 462 nodes, 0 errors | 462 nodes, 0 console errors, 0 failed requests | 10.7 s |
| demo-cordis-web | broken | pass, 200, 260 assets | 3048 ms |
| import-smoke | 275 of 277 | 246 of 248, the same two browser-only entries fail | 4913 ms |

Whole Phase B list: 67.6 s. Nothing that passed before fails now; three checks that were broken before pass.

Tree: 4361 files and 13 554 902 bytes before, 3550 files and 6 516 675 bytes after. Dependency set: 510 lockfile packages, 284 importers, 419 store entries and 283 020 191 bytes of `node_modules` before; 429 packages, 255 importers, 375 store entries and 233 169 462 bytes after. No package version was added or changed.

## Recorded, not fixed

- No `DEEPSEEK_API_KEY` on this host: a headless run against a live model was not possible before or after.
- `packages/client/ui-workflow-run` registers a slot for `freddie-workflow-run-panel`, an element only the unimported `WorkflowRunPanel.js` defined; it never rendered before the removal either.
- `packages/client/ui-settings-web-search` binds the `web-search-deepseek` settings namespace, which no remaining package reads; the web bundle still mounts the card, so it stays.
- `packages/core/session/src/known-event-types.js` keeps `hook/invoked`, `hook/result` and `web/deepseek-search-llm-request` so session logs written with them stay readable.
- Agent Notes are historical records: 11 links in 10 notes point at files this reduction removed, and 160 links in 81 notes were dead before it.
- Ignored `node_modules` directories remain on disk under 26 removed package directories; they are untracked and were left.
