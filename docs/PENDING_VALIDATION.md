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
| sdk-initialize | answers; the reply is the error `paths[0] must be of type string` (the runner sent ACP-shaped params, not the SDK wire fields) | 1112 ms |
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
| unlinked notes and pages (4933f3b0), doc repair (7997b37b) | no kept document outside Agent Notes links to a removed file — verified with a whole-tree link check in the increment below |
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
| sdk-initialize | `paths[0]` error reply caused by an ACP-shaped probe | pass, `serverInfo.name` `freddie-sdk-runtime`; the server now rejects missing `cwd`/`provider`/`model` with a field-named error | 1753 ms |
| demo-acp, demo-cordis-acp, demo-code-mode | pass | pass | 1146, 3097, 10900 ms |
| web-boot | 200, 260 assets | 200, 260 assets, 0 bad | 3889 ms |
| web-browser | 462 nodes, 0 errors | 462 nodes, 0 console errors, 0 failed requests | 10.7 s |
| demo-cordis-web | broken | pass, 200, 260 assets | 3048 ms |
| import-smoke | 275 of 277 | 246 of 248, the same two browser-only entries fail | 4913 ms |

Whole Phase B list: 67.6 s. Nothing that passed before fails now; three checks that were broken before pass.

Tree: 4361 files and 13 554 902 bytes before, 3550 files and 6 516 675 bytes after. Dependency set: 510 lockfile packages, 284 importers, 419 store entries and 283 020 191 bytes of `node_modules` before; 429 packages, 255 importers, 375 store entries and 233 169 462 bytes after. No package version was added or changed.

## Increment: SDK initialize wire validation

The bare-`initialize` error in the baseline was a check-harness defect: `runs/analysis/baseline.mjs` sent ACP-shaped params (`protocolVersion`, `clientCapabilities`) to the SDK profile, whose wire requires `cwd`, `provider` and `model`. The server also lacked a boundary check, so a malformed peer received Node's opaque `paths[0]` TypeError. Both are fixed.

| Check | Command | Result |
|---|---|---|
| SDK handshake | `node runs/analysis/baseline.mjs after-verify sdk-initialize` | pass, `PASS sdk-initialize 1753ms {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"freddie-sdk-runtime","version":"0.0.1"}}}` |
| missing-field validation | `node runs/analysis/sdk-negative.mjs` | pass, 3 malformed frames each answer the expected field-named `TypeError` |
| initialize → prompt | `node runs/analysis/sdk-prompt.mjs` | pass, `messageId=2bd1c793-20d4-41bd-9cdc-0253dd2493f0` |
| adjacent profiles | `node runs/analysis/baseline.mjs after-verify dump-sdk,acp-initialize,dump-web,dump-headless,dump-acp,headless-no-key` | 6 pass, four dumps byte-identical to the recorded md5 values |
| publish shape | `pnpm run publint` | pass |

The runner and its two probe scripts are under ignored `runs/`, so only the server, its two READMEs, this document and the Agent Note are tracked changes. The SDK wire contract is unchanged for conforming clients; a malformed `initialize` now fails loudly at the readiness boundary.

A follow-up pass removed three stale references to the deleted TypeScript SDK toolchain: `packages/sdk/server/README.md` linked `src/server.ts` instead of `src/server.js`, and `packages/sdk/protocol/README.md` described a `types.ts` module, a `JsonRpcTransportPeer` type and named TS payload aliases that this buildless package does not ship. The protocol README's wire table now names the actual JSON fields from `packages/sdk/server/src/server.js`. Checked: both READMEs have zero dead relative links; `pnpm run publint` and `node runs/analysis/baseline.mjs final2 sdk-initialize` pass.

## Increment: kept-document link integrity

The Phase A row "no kept document outside Agent Notes links to a removed file" was claimed without a whole-tree check. A scan of all 676 tracked Markdown files outside `.agents/notes/` found 16 apparent dead link targets: 12 genuine stale `.ts` paths (the buildless tree ships `.js`) and 4 inline-code examples a naive regex misread as links. A separate fragment check found 3 broken `#fragment` anchors. All 12 `.ts` targets have a `.js` equivalent in the same directory. The three anchors were `AGENTS.md#run-relevant-checks-locally` (renamed to `verify-before-pushing`), a double-hyphen slug in `providers.md`, and `development.md#typescript-project-layout` (section removed with the TS toolchain). The compaction README's paragraph around the last anchor also described a `TS2717` compile error and a source-type pin that cannot occur in a buildless repo; it now states the actual contract — the checkpoint leaf imports no cordis, so a client or wire program names the source without importing the root — and links `development.md#package-layout`.

| Check | Command | Result |
|---|---|---|
| whole-tree link and anchor scan | node inline script over `git ls-files '*.md'` | `kept docs: 676, dead links: 0, bad md fragments: 0`, exit 0 |
| publish shape | `pnpm run publint` | pass |
| whitespace | `git diff --check` | exit 0 |

The scan skips Agent Notes (historical records), external URLs, root-absolute paths, `.js#L<n>` GitHub source-line links and inline-code examples, and checks Markdown-to-Markdown fragment slugs plus explicit `<a id>` anchors. The four inline-code examples (`@[label](uri)`, `isConcurrencySafe(args)`, `YYYY-MM-DDTHH:mm:ss[.S|.SS|.SSS](Z|±HH:MM)`, `[<title-or-url>](<url>)`) are prose, not links. Prose mentions of `src/types.ts` and `types.ts` that are not links were swept in the increment below.

## Increment: shipped source names in package READMEs

A scan of every tracked package README for backticked `.ts` source-path tokens found 47 mentions across 24 READMEs whose target ships as a `.js` file in the same package, plus one unbackticked `src/platform.ts` in `packages/client/web/README.md`. Each was verified to have exactly one `.js` equivalent under that package's `src/` tree, then renamed in place (48 replacements). Changing the `App attribution` heading in `packages/llm/llm/README.md` changed its slug, so the one inbound link in `packages/llm/llm-deepseek/README.md` was updated to `#app-attribution-attributionjs`. A scan of non-package kept documents found no further shipped-file `.ts` tokens; the `.ts` names in `docs/cordis-tutorial/`, postmortems and generator-script references are tutorial examples or historical records.

Ten `.ts` tokens remain in package READMEs. `git log --all -- <path>` reports each path never existed in this repository: they name dsh-predecessor files (`bindings.ts`, `src/client/contract.ts`, `src/types.ts`, `contract.ts`, `src/client/slots.ts`, `src/client-catalog.ts`, `src/curation.ts`, `scripts/gen-client-catalog.ts`) or a removed e2e test (`apps/web/tests/startup-rpc-budget.e2e.ts`). Rewriting those sentences needs a decision about what each historical claim now means, so they stay as recorded prose.

| Check | Command | Result |
|---|---|---|
| remaining shipped-file tokens | node scan of `git ls-files 'packages/**/README.md'` | 10 remaining, all `NO_JS` and absent from git history |
| whole-tree link and anchor scan | node inline script over `git ls-files '*.md'` | `kept docs: 676, dead links: 0, bad md fragments: 0`, exit 0 |
| publish shape | `pnpm run publint` | pass |
| whitespace and newlines | `git diff --check`; tail-byte check on each changed file | exit 0; all files end with exactly one newline |

## Recorded, not fixed

- No `DEEPSEEK_API_KEY` on this host: a headless run against a live model was not possible before or after.
- `packages/client/ui-workflow-run` registers a slot for `freddie-workflow-run-panel`, an element only the unimported `WorkflowRunPanel.js` defined; it never rendered before the removal either.
- `packages/client/ui-settings-web-search` binds the `web-search-deepseek` settings namespace, which no remaining package reads; the web bundle still mounts the card, so it stays.
- `packages/core/session/src/known-event-types.js` keeps `hook/invoked`, `hook/result` and `web/deepseek-search-llm-request` so session logs written with them stay readable.
- Agent Notes are historical records: 11 links in 10 notes point at files this reduction removed, and 160 links in 81 notes were dead before it.
- Ten `.ts` tokens in package READMEs name dsh-predecessor or removed-test files that never existed in this repository; each sentence needs an editorial decision about its historical claim.
- Ignored `node_modules` directories remain on disk under 26 removed package directories; they are untracked and were left.
