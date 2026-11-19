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

## fx split Phase A: dedup merges (2026-11-18)

Local commits as lanmower. Each row names the files and the Phase B witness it needs. The witnesses run in Phase B, after the fx side is pushed.

| Commit | Change | Files | Phase B witness |
|---|---|---|---|
| 94471ada | runner-failure classifier moved into sandbox-policy | packages/sandbox/sandbox-policy/src/index.js, src/runner-failure.js, package.json; packages/shell/bash-sandbox and pwsh-sandbox src/index.js, package.json, AGENTS.md; helpers.js removed from both | import both sandboxes and read classifyRunnerFailure from @freddie/freddie-sandbox-policy; pnpm run publint |
| de79ae6c | typert json parameter: one typert-parameter.js per package | packages/api/remote-stream, session-controller and terminal-controller: src/typert-parameter.js, typert.host.js, typert.remote-client.js, package.json | boot the web profile and read the remoteStream, session list and terminal list endpoints; pnpm run publint |
| f4f3664b | passthrough stub shared by sessions and terminals schemas | packages/host/apiproxy/src/api/passthrough.js, sessions.schema.js, terminals.schema.js | import the apiproxy api index and parse one session list and one terminal list request; pnpm run publint |
| 1e216623 | lastStep shared by turn-error and turn-max-tokens | packages/client/ui-conversation/src/client/conversation-nodes/common.js, turn-error.js, turn-max-tokens.js | boot the web profile and render a turn that ends in error and one that hits max tokens in the browser, with no console errors |

Also see docs/fx-split.md for the inventory and the proposed merges that were not made.

## fx split Phase A: runtime adapter (2026-11-18)

Local commits as lanmower, none pushed in Phase A. Each commit routes agent-side Node built-ins through @freddie/freddie-runtime. The Phase B witness is in the last column; Phase B runs it on the final tree, after pnpm install updates the lockfile for the new dependency.

| Commit | Change | Files | Phase B witness |
|---|---|---|---|
| f908497 |  feat(runtime): add the runtime adapter for agent-side Node built-ins | 32 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| bf91122 |  refactor(apps/cli): route agent-side Node built-ins through the runtime adapter | 2 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 2c8bc8f |  refactor(framework): route agent-side Node built-ins through the runtime adapter | 14 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| a023d88 |  refactor(acp): route agent-side Node built-ins through the runtime adapter | 3 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 1b8ec00 |  refactor(api): route agent-side Node built-ins through the runtime adapter | 13 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 91502a8 |  refactor(attachment): route agent-side Node built-ins through the runtime adapter | 6 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| b626978 |  refactor(boot): route agent-side Node built-ins through the runtime adapter | 7 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 5705eff |  refactor(bundle): route agent-side Node built-ins through the runtime adapter | 4 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| e0a2b0c |  refactor(code-runtime): route agent-side Node built-ins through the runtime adapter | 5 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 37fca63 |  refactor(compaction): route agent-side Node built-ins through the runtime adapter | 4 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 9a33d8f |  refactor(context): route agent-side Node built-ins through the runtime adapter | 15 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| f98d8c8 |  refactor(core): route agent-side Node built-ins through the runtime adapter | 7 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 2278d74 |  refactor(credentials): route agent-side Node built-ins through the runtime adapter | 2 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 4fa989f |  refactor(examples): route agent-side Node built-ins through the runtime adapter | 3 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 3a1cfda |  refactor(experimental): route agent-side Node built-ins through the runtime adapter | 8 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 350f700 |  refactor(extensions): route agent-side Node built-ins through the runtime adapter | 8 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 30a6123 |  refactor(feedback): route agent-side Node built-ins through the runtime adapter | 2 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| fe3e509 |  refactor(fs): route agent-side Node built-ins through the runtime adapter | 15 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| b2787ea |  refactor(goal): route agent-side Node built-ins through the runtime adapter | 6 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| f1ad697 |  refactor(host): route agent-side Node built-ins through the runtime adapter | 26 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 5c6d189 |  refactor(identity): route agent-side Node built-ins through the runtime adapter | 2 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 72b6cb8 |  refactor(interaction): route agent-side Node built-ins through the runtime adapter | 4 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| d165d4e |  refactor(llm): route agent-side Node built-ins through the runtime adapter | 11 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 21baa2e |  refactor(mcp): route agent-side Node built-ins through the runtime adapter | 2 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 9d5938b |  refactor(preset): route agent-side Node built-ins through the runtime adapter | 7 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 7bad6c9 |  refactor(runtime-diagnostics): route agent-side Node built-ins through the runtime adapter | 5 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| eda9521 |  refactor(sandbox): route agent-side Node built-ins through the runtime adapter | 17 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| cf95625 |  refactor(sdk): route agent-side Node built-ins through the runtime adapter | 5 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 48bb532 |  refactor(session): route agent-side Node built-ins through the runtime adapter | 15 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 652fdbe |  refactor(session-query): route agent-side Node built-ins through the runtime adapter | 3 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 451c8dc |  refactor(settings): route agent-side Node built-ins through the runtime adapter | 4 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 81cfcce |  refactor(shell): route agent-side Node built-ins through the runtime adapter | 13 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| b4c0eba |  refactor(skill): route agent-side Node built-ins through the runtime adapter | 6 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| c272b1a |  refactor(spill): route agent-side Node built-ins through the runtime adapter | 5 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 7b42722 |  refactor(storage): route agent-side Node built-ins through the runtime adapter | 4 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 13a5456 |  refactor(subagent): route agent-side Node built-ins through the runtime adapter | 13 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| a94799f |  refactor(subprocess): route agent-side Node built-ins through the runtime adapter | 8 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| edda7d8 |  refactor(terminal): route agent-side Node built-ins through the runtime adapter | 3 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 62986a0 |  refactor(typert): route agent-side Node built-ins through the runtime adapter | 2 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 6ebf0d4 |  refactor(util): route agent-side Node built-ins through the runtime adapter | 10 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 048a8e3 |  refactor(web): route agent-side Node built-ins through the runtime adapter | 6 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 99baf7d |  refactor(workflow): route agent-side Node built-ins through the runtime adapter | 5 | publint; baseline dumps identical; web boot; import smoke of the changed package |
| 05f1653 |  refactor(workspace): route agent-side Node built-ins through the runtime adapter | 4 | publint; baseline dumps identical; web boot; import smoke of the changed package |

Inventory and per-file uses: docs/fx-split.md, section Node-only uses in agent-side code.

## fx split Phase B: runtime adapter on the final tree (2026-11-18)

Run with runs/analysis/baseline.mjs and runs/analysis/phaseB.sh on the tree after the adapter, the 41 group commits, the entry fix c971f13d and the lockfile commit. DEEPSEEK_API_KEY is not set on this host, so the headless profile stops at its credential gate, as its no-key witness expects.

| Check | Result | Evidence |
|---|---|---|
| install | PASS | Already up to date / Done in 326ms using pnpm v11.7.0 |
| publint | PASS | All good! / $ node scripts/publint-all.js |
| third-party-notices | PASS | gen-third-party-notices: THIRD_PARTY_NOTICES.md is up to date. / $ node scripts/gen-third-party-notices.js --check |
| rescope-vendor-check | PASS | rescope-vendor: post-state verified — no residue, every exact edit landed, idempotent. / $ node scripts/rescope-vendor.js --check |
| release-verify-freddie | PASS | @freddie/freddie-client-runtime -> @freddie/freddie-host-apiproxy / release verify: family freddie, 235 member(s), 0.1.1-rc.2, publish order resolved, |
| release-verify-vendor | PASS | @freddie/cordis-plugin-loader -> @freddie/cordis / release verify: family vendor, 10 member(s), 9 versions, publish order resolved, 2 peer declaration |
| cli-help | PASS | / 0.1.1-rc.2 |
| dump-web | PASS | bytes 20138 md5 ec3165180a7193232905f7b115d1786b |
| dump-headless | PASS | bytes 13257 md5 6067aa2192eaff47da8de1ae597d9882 |
| dump-acp | PASS | bytes 12918 md5 4668262cf13066c3639e2a376b48de81 |
| dump-sdk | PASS | bytes 13077 md5 fe0324ee81713a18fc899c0c1818a508 |
| headless-no-key | PASS | freddie: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"; store DEEPSEEK_API_KEY through the credentials service ( |
| acp-initialize | PASS | {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentInfo":{"name":"freddie-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{ |
| sdk-initialize | PASS | {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"freddie-sdk-runtime","version":"0.0.1"}}} |
| demo-acp | PASS | {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentInfo":{"name":"freddie-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{ |
| demo-cordis-acp | PASS | {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentInfo":{"name":"freddie-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{ |
| demo-code-mode | PASS | {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentInfo":{"name":"freddie-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{ |
| web-boot | PASS | GET / 200 htmlBytes 48902 assets200 261 bad [] |
| demo-cordis-web | PASS | GET / 200 htmlBytes 48902 assets200 261 bad [] |
| import-smoke | PASS | 249 packages, ok 247, failing 2: freddie-client-ui-primitives,freddie-client-web |

import-smoke is informational: 247 of 249 packages import. The two failures are the browser-only client entries @freddie/freddie-client-ui-primitives (HTMLElement is not defined in Node) and @freddie/freddie-client-web (Cannot find package webjsx); neither file changed in this stage.

Live headless boot: node apps/cli/src/bin.js --profile headless "Reply with the word ready." exits 1 with MISSING_CREDENTIAL, as expected without a key.


## fx split Phase A: txiki implementation of the runtime contract (2026-11-18)

Local commits as lanmower, not pushed. Each row names the witness Phase B must produce.

| Commit | Change | Phase B witness |
|---|---|---|
| e0314416 | packages/util/runtime/src/txiki.js: txikiRuntime, the second implementation of the contract | tjs test/contract-txiki.js passes with 114 names present; a live import of the agent packages under txiki |
| 199b894f | src/install-txiki.js and the ./install-txiki export, plus the files list | publint on packages/util/runtime; node test/contract-node.js still passes |
| c5102087 | packages/util/runtime/test: contract names for 25 subpaths, subpaths, check, and the node and txiki entries | node test/contract-node.js and tjs test/contract-txiki.js both print their present count |
| (docs commit) | docs/fx-split.md gap table, README, this section, and the Agent Note | every name in the gap table throws the documented message under txiki |

## fx split Phase B: txiki implementation of the runtime contract (2026-11-18)

Run under gm's pinned txiki (run_code, native/components/quickjs) on the tree after the Phase A commits and the utf-16le fix. Node runs use node directly. No standalone tjs CLI is built on this host.

| Check | Result | Evidence |
|---|---|---|
| contract-node (Node runtime) | PASS | node: 114 names present across 25 subpaths, exit 0 |
| contract (txiki runtime) | PASS | 114 present, missing []; contract-txiki.js imports without error under gm txiki |
| txiki behaviour probes | PASS | path.join, Buffer base64, hex, utf16le, concat, write and read, URL round trip, env, cwd, pid, os homedir and cpus, uuid, randomBytes, isIP, StringDecoder, timers, fs.promises mkdtemp, writeFile, readFile, stat, mkdir recursive, readdir withFileTypes, cp recursive, rm recursive, rename, realpath, truncate, unlink, ENOENT code |
| txiki gap messages | PASS | process.platform, os.platform, fs.readFileSync, crypto.createHash, access with a mode, writeFile flag a, opendir, AbortSignal, StringDecoder latin1, randomBytes callback, Worker, parentPort, exitCode, dns lookup, zlib.gzip and vm.Script each throw the documented message |
| cosmokit array and job-controller rows under txiki | PASS | contain true, deduplicate [1,2,3], difference [1,3], intersection [2,3], union [1,2,3], remove true |
| Cordis composition under txiki | BLOCKED | could not load module @freddie/cosmokit: gm loader reads bare specifiers as paths (engine.cpp load_module_from_disk) |
| agent packages importing @freddie/freddie-runtime/* under txiki | BLOCKED | could not load module @freddie/freddie-runtime/fs-promises: same loader limit |
| publint (pnpm run publint) | recorded in the Phase B report | exit 0 and All good! on the final tree |

Defect found and fixed in Phase B: txiki's TextDecoder rejects utf-16le, which made the whole module fail to load. txiki.js now decodes utf-16le itself.


## root workspace link for @freddie/freddie-runtime (2026-11-18)

Phase A, local commit as lanmower, not pushed. The root package.json declares "@freddie/freddie-runtime": "*" in dependencies, and pnpm-lock.yaml gains the importer entry importers["."].dependencies pointing at link:packages/util/runtime. The link comes from pnpm, not from a hand-made symlink. Phase B witness: pnpm install, then the literal import '@freddie/freddie-runtime/fs-promises' from /workspace/freddie under Node and under gm's txiki, both resolving to packages/util/runtime/src/fs-promises.js.

## root workspace link: Phase B on the final tree (2026-11-18)

pnpm install exited 0, and node_modules/@freddie/freddie-runtime is a pnpm link to packages/util/runtime. The literal import from /workspace/freddie resolves to packages/util/runtime/src/fs-promises.js.

| Check | Result | Evidence |
|---|---|---|
| literal root import, Node | PASS | node: fs-promises readFile is function; resolved file:///workspace/freddie/packages/util/runtime/src/fs-promises.js |
| literal root import, gm txiki | PASS | install-txiki loaded; fs-promises readFile and stat are functions, 19 names; root-linked path and writeFile, readFile, stat round trip returned "hi from txiki", isFile true, size 13 |
| contract, Node | PASS | node: 114 names present across 25 subpaths, exit 0 |
| contract, txiki (gm) | PASS | present 114, missing [] |
| publint | PASS | pnpm run publint exit 0, All good! |

Needs the rebuilt gm-core: the run_code loader resolves bare imports from the project root (b4f85a4). The gm server running in the session before this rebuild still resolves them from the process directory, so the txiki rows were run through a rebuilt gm-core binary over MCP stdio.


## fx split Phase A: behaviour parity suite (2026-11-19)

Local commit as lanmower, not pushed. The top ranked open item in docs/fx-split.md.

| Change | Phase B witness |
|---|---|
| packages/util/runtime/test/parity-cases.js: 46 shared cases over the implemented surface and 17 gap cases | node test/parity-node.js prints 46/46 shared cases match; under gm's txiki, runParity('txiki', true) reports 46/46 and 17/17 |
| packages/util/runtime/test/parity-node.js and parity-txiki.js: the Node and txiki entries | both entries exit 0 with their line printed, each with wall time |
| docs/fx-split.md: the ranked open items | none; the ranking is the record |

## fx split Phase B: behaviour parity suite (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/parity-node.js | 47/47 shared cases match; exit 0 | 0.11 s process, 23 ms in runParity |
| runParity('txiki', true) under gm's pinned txiki, through the rebuilt gm-core over MCP stdio | 47/47 shared cases match, 17/17 gaps throw the documented message, mismatches [] | 0.29 s probe, 115 ms in runParity |
| node test/contract-node.js | 114 names present across 25 subpaths; exit 0 | 0.08 s |
| contract under gm's txiki | present 114, missing [] | probe run, same process as the parity witness |

Defect found and fixed: txiki's Buffer had a static isView that Node's Buffer does not have. Node's parity run failed on the case that used Buffer.isView, so the case was corrected to ArrayBuffer.isView, and a new case asserts typeof Buffer.isView is undefined. The txiki implementation no longer defines it. Before the fix, the txiki side would have passed the old case and missed the extra member; the new case fails on it.

Loader note: the txiki witness must install and import through the same path. Installing through node_modules/@freddie/freddie-runtime and importing through packages/ gave two runtime instances, and the subpaths saw an uninstalled one.

## fx split: util.isDeepStrictEqual and util.parseEnv in pure JS (2026-11-19)

Ranked item 2 in docs/fx-split.md. Both functions are pure JS in src/txiki.js. isDeepStrictEqual compares prototypes, own enumerable keys including symbols, Date time, RegExp source and flags, Error name and message, boxed primitives, typed-array and ArrayBuffer bytes, and Map and Set members, with cycle detection. parseEnv follows Node's dotenv grammar: an optional export prefix, single, double and backtick quotes, double-quoted escapes and multi-line values, inline comments, and last-wins duplicates.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| packages/util/runtime/src/txiki.js: isDeepStrictEqual and parseEnv replace their gap entries | node --check passes; the txiki module loads | parity-txiki under gm: 91/91 shared cases, 15/15 gaps |
| packages/util/runtime/test/parity-cases.js: 31 EQUALITY_PROBES and 13 ENV_PROBES, expected values from Node's output | node --check passes | parity-node: 91/91 |
| docs/fx-split.md: gap table row for util drops both names; ranked row 2 marked done | grep shows the new rows | none |

## fx split: crypto.randomBytes callback and timers/promises AbortSignal (2026-11-19)

Ranked item 3 in docs/fx-split.md. randomBytes with a callback fills the bytes synchronously and calls back on a later turn with (null, Buffer), returning undefined, as Node does. timers/promises setTimeout honours an AbortSignal: an already-aborted or later-aborted signal rejects with an AbortError (name AbortError, code ABORT_ERR, message The operation was aborted) whose cause is the signal reason; a signal that never aborts resolves normally.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| packages/util/runtime/src/txiki.js: randomBytes takes a callback; abortError and delay honour an AbortSignal | node --check passes | parity-txiki under gm: 98/98 shared cases, 13/13 gaps |
| packages/util/runtime/test/parity-cases.js: 7 new shared cases for the callback order, Buffer shape, abort rejection, abort cause identity, and a non-aborted resolve; the two gap entries removed | node --check passes | parity-node: 98/98 |
| docs/fx-split.md: crypto row drops randomBytes; the timers/promises row is removed from the gap table; ranked row 3 marked done | grep shows the rows | none |

## fx split: fs.promises.opendir with Dir (2026-11-19)

Ranked item 4 in docs/fx-split.md, the third item of this stage. opendir awaits tjs.readDir, so a missing path rejects with ENOENT and a file with ENOTDIR, as Node does. Dir has path, read (a Dirent or null at the end), close (a second close rejects with ERR_DIR_CLOSED), and an async iterator that closes the Dir when it finishes or breaks. read after close rejects with ERR_DIR_CLOSED. The differences are listed in docs/fx-split.md under "Behaviour differences found in items 1 to 3".

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| packages/util/runtime/src/txiki.js: closedDirError, the Dir class, and opendir replace the fs.promises.opendir gap | node --check passes | parity-txiki under gm: 102/102 shared cases, 12/12 gaps |
| packages/util/runtime/test/parity-cases.js: 4 cases (Dir reads and close, async iterator and break, ENOENT, ENOTDIR) and the gap entry removed | node --check passes | parity-node: 102/102 |
| docs/fx-split.md: fs.promises gap row drops opendir; ranked row 4 marked done; the behaviour-differences subsection | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-parity-items-1-to-3.md: the Agent Note for the three items | none | none |

## fx split: Phase B for ranked items 1 to 3 (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 114 names present across 25 subpaths; exit 0 | 0.09 s |
| node test/parity-node.js | 102/102 shared cases match; exit 0 | 0.24 s process, 85 ms in runParity |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 114, missing [] | 0.17 s probe |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 102, gaps 12, mismatches [], unexpectedGaps [] | 0.37 s probe, 209 ms in runParity |

Defect found and fixed in Phase B: txiki's Dir read after the end called the iterator again, and txiki's iterator returns undefined there, so read threw. Dir now records exhaustion and returns null.

## fx split: zlib.gzip and gunzip through CompressionStream (2026-11-19): blocked

Ranked item 5 in docs/fx-split.md. Phase A changes:

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| packages/util/runtime/src/txiki.js: bytesOf, concatBytes, transformBytes, runCodec, gzip and gunzip callback forms; zlib export gains gunzip and gzip, and gzip leaves the gap list | node --check passes | txiki contract present 115; txiki parity: the five zlib cases fail with "not a function" (see below) |
| packages/util/runtime/src/zlib.js: export gunzip | node --check passes; Node contract 115 names | Node contract 115 names present across 25 subpaths |
| packages/util/runtime/test/contract-names.js: gunzip added to the zlib list | node --check passes | contract count 115 |
| packages/util/runtime/test/parity-cases.js: five zlib shared cases; the zlib.gzip gap entry removed | node --check passes | Node parity 107/107; txiki parity 102/107 with the five zlib cases failing |
| docs/fx-split.md: zlib section with the cause; ranked row 5 marked blocked; zlib removed from the http row of the gap table | grep shows the rows | none |

Node witnesses are recorded in the Phase B section below.

## fx split: fs.promises.writeFile with flag a (2026-11-19)

Ranked item 6 in docs/fx-split.md. Flag a opens with tjs.open(path, 'a') and writes until every byte is written; flag w is unchanged; any other flag or mode stays a gap.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| packages/util/runtime/src/txiki.js: writeFile takes flag a through tjs.open with a write loop | node --check passes | txiki parity: the 5 append cases are not among the mismatches |
| packages/util/runtime/test/parity-cases.js: 5 shared cases (new file, existing file, bytes unchanged, a 200000-byte buffer appended in full, the default flag still overwrites) and withScratch | node --check passes | Node parity 112/112 |
| docs/fx-split.md: gap row now names flag w or a; the append note; ranked row 6 marked done | grep shows the rows | none |

## fx split: Phase B for ranked items 5 and 6 (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 115 names present across 25 subpaths (gunzip added to zlib); exit 0 | 0.15 s |
| node test/parity-node.js | 112/112 shared cases match; exit 0 | 0.32 s process, 166 ms in runParity |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 115, missing [] | 0.27 s probe |
| parity under gm's txiki (probe with the rebuilt gm-core) | runParity throws "txiki parity failed" with 5 mismatches, all zlib: the round trip, header bytes, trailer, empty input and bad input; the 5 append cases pass; unexpectedGaps [] | 0.75 s probe |

Item 5 (zlib over CompressionStream) is blocked by the txiki build, not by the code: the streams throw "not a function" for each valid format. The cause and what settles it are in docs/fx-split.md under the zlib section. The txiki parity run exits non-zero until then. Item 6 (writeFile flag a) passes under both runtimes.

## fx split: zlib gzip and gunzip are gaps under txiki (2026-11-19)

Decision, recorded in docs/fx-split.md under "zlib gzip and gunzip under txiki". The txiki build has no working compressor, so zlib.gzip and zlib.gunzip are gaps under txiki, each throwing the documented gap message. Node keeps the same five zlib cases with unchanged expectations.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| packages/util/runtime/src/txiki.js: the stream codec removed; gzip and gunzip return to the gap list | node --check passes | txiki contract present 115; the gap list includes zlib.gzip and zlib.gunzip |
| packages/util/runtime/test/parity-cases.js: each zlib case carries a gap field; runParity asserts the exact documented gap message for gap-field cases and for gapCases; zlib.gzip and zlib.gunzip gap entries added; the StringDecoder gap case relabelled to the documented name | node --check passes | txiki parity: 0 mismatches, 0 unexpected gaps, 5 gap-asserted |
| docs/fx-split.md: zlib section rewritten as the decision and its reason; zlib row in the gap table; ranked row 5 marked as gaps | grep shows the rows | none |

## fx split: Phase B for the zlib gap decision (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.12 s |
| node test/parity-node.js | 112/112 shared cases match; 0 gaps; exit 0 | 0.17 s process, 68 ms in runParity |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 115, missing [] | 0.17 s probe |
| contract gap names under gm's txiki (probe reads each member's function name, calls nothing) | 51 of the 111 non-default names are gaps; the other 4 are default exports | 0.20 s probe |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 112, gapAsserted 5, gaps 13, mismatches [], unexpectedGaps []; runParity returned, so the entry exits zero | 0.48 s probe, 299 ms in runParity |

Gap names in the txiki contract (51): fs.accessSync fs.closeSync fs.createReadStream fs.existsSync fs.lstatSync fs.mkdirSync fs.mkdtempSync fs.openSync fs.readFileSync fs.readSync fs.readdirSync fs.readlinkSync fs.realpathSync fs.rmSync fs.statSync fs.symlinkSync fs.unlinkSync fs.unwatchFile fs.watchFile fs.writeFileSync fs.writeSync crypto.createHash stream.PassThrough stream.Readable stream.Writable stream.pipeline util.parseArgs module.createRequire module.stripTypeScriptTypes child-process.execFile child-process.execFileSync child-process.spawn child-process.spawnSync os.networkInterfaces os.platform os.release worker-threads.Worker async-hooks.AsyncLocalStorage vm.Script vm.createContext vm.runInContext http.createServer http.validateHeaderValue zlib.brotliCompress zlib.createZstdDecompress zlib.gunzip zlib.gzip zlib.zstdCompress zlib.zstdDecompress zlib.zstdDecompressSync inspector.Session.

## fx split: os.networkInterfaces and util.parseArgs under txiki (2026-11-19)

Ranked items 7 and 8 in docs/fx-split.md. Both are implemented in pure JS in src/txiki.js. Phase A changes:

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: networkInterfaces regroups tjs.system.networkInterfaces (prefixLength, expandIPv6); parseArgs with tokenizeArgs, shortToken, longToken, valueToken, storeOptionToken; both exported; gapFunctions drops os.networkInterfaces and util.parseArgs | node --check passes | txiki contract present 115; gap names 49 (was 51) |
| test/parity-cases.js: 6 os.networkInterfaces shared cases; 41 util.parseArgs shared cases; parseArgsOutcome helper; loopbackEntries helper; gap entry util.parseArgs without args | node --check passes | Node parity 159/159; txiki parity 159/159 with 0 mismatches, 14 gaps |
| docs/fx-split.md: util row removed from the gap table; os row drops networkInterfaces; ranked rows 7 and 8 marked done; section for both | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-os-networkinterfaces-and-parseargs.md: Agent Note | none | none |

## fx split: Phase B for ranked items 7 and 8 (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.09 s |
| node test/parity-node.js | 159/159 shared cases match (6 networkInterfaces, 41 parseArgs, the rest unchanged); exit 0 | 0.19 s process, 91 ms in runParity |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 115, missing [] | 0.18 s probe |
| contract gap names under gm's txiki | 49 of the 111 non-default names are gaps (was 51): os.networkInterfaces and util.parseArgs left the list | 0.16 s probe |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 159, gapAsserted 5, gaps 14, mismatches [], unexpectedGaps []; runParity returned, so the entry exits zero | 0.47 s probe, 301 ms in runParity |

Gap names in the txiki contract (49): fs.accessSync fs.closeSync fs.createReadStream fs.existsSync fs.lstatSync fs.mkdirSync fs.mkdtempSync fs.openSync fs.readFileSync fs.readSync fs.readdirSync fs.readlinkSync fs.realpathSync fs.rmSync fs.statSync fs.symlinkSync fs.unlinkSync fs.unwatchFile fs.watchFile fs.writeFileSync fs.writeSync crypto.createHash stream.PassThrough stream.Readable stream.Writable stream.pipeline module.createRequire module.stripTypeScriptTypes child-process.execFile child-process.execFileSync child-process.spawn child-process.spawnSync os.platform os.release worker-threads.Worker async-hooks.AsyncLocalStorage vm.Script vm.createContext vm.runInContext http.createServer http.validateHeaderValue zlib.brotliCompress zlib.createZstdDecompress zlib.gunzip zlib.gzip zlib.zstdCompress zlib.zstdDecompress zlib.zstdDecompressSync inspector.Session.

## fx split: http.validateHeaderValue, ranked first among the pure-JS gaps (2026-11-19)

The txiki gap names were ranked by pure-JS feasibility in docs/fx-split.md under "Remaining txiki gap names, ranked". The top item is implemented here.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: validateHeaderValue (undefined, and characters outside tab, 0x20-0x7e, 0x80-0xff, throw Node's codes and messages); the http export takes it and keeps createServer as a gap; the coded-error helper renamed parseArgsError to codedTypeError, since two features share it | node --check passes | txiki parity: 0 mismatches; contract gap list 48 |
| test/parity-cases.js: 13 shared cases for validateHeaderValue, including the name-not-checked and coercion cases | node --check passes | Node parity 172/172 |
| docs/fx-split.md: the ranked list of the 49 gap names with each one's class, and the http gap-table row | grep shows the rows | none |

## fx split: Phase B for http.validateHeaderValue (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.14 s |
| node test/parity-node.js | 172/172 shared cases match; exit 0 | 0.27 s process, 115 ms in runParity |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 115, missing [] | 0.24 s probe |
| contract gap names under gm's txiki | 48 of the 111 non-default names (was 49): http.validateHeaderValue left the list; the diff against the previous list shows only that name | 0.28 s probe |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 172, gapAsserted 5, gaps 14, mismatches [], unexpectedGaps []; runParity returned, so the entry exits zero | 0.60 s probe, 323 ms in runParity |
