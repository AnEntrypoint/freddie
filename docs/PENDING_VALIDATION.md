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

## fx split: os.release under txiki (2026-11-19)

Ranked item 2 in docs/fx-split.md. os.release reads /proc/sys/kernel/osrelease once at txiki module load and returns the cached value. Missing file: the documented gap.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: top-level read of /proc/sys/kernel/osrelease (ENOENT gives undefined, other errors rethrow); os.release is the cached value, or the gap when the read found no file; gapFunctions drops os.release | node --check passes | txiki contract present 115; gap names 47 (was 48) |
| test/parity-cases.js: 4 shared cases comparing os.release with the file read through fs-promises, and shape checks; a gap entry for os.release with an applies predicate; runParity skips inactive gaps and reports gapApplied and gapInactive | node --check passes | Node parity 176/176; txiki parity 176/176, gapInactive 1 |
| docs/fx-split.md: ranked row 2 marked done with the Linux caveat; section for os.release | grep shows the row | none |

## fx split: Phase B for os.release (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.14 s |
| node test/parity-node.js | 176/176 shared cases match; exit 0 (two runs: 97 ms and 100 ms in runParity; one earlier run took 1231 ms inside runParity and was not reproduced) | 0.23 s process |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 115, missing [] | 0.32 s probe |
| contract gap names under gm's txiki | 47 of the 111 non-default names (was 48): os.release left the list on Linux | 0.21 s probe |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 176, gapAsserted 5, gaps 14 applied, gapInactive 1 (the non-Linux os.release gap, not active here), mismatches [], unexpectedGaps []; runParity returned, so the entry exits zero | 0.52 s probe, 306 ms in runParity |

## fx split: fs.watchFile and fs.unwatchFile under txiki (2026-11-19)

Ranked item 3 in docs/fx-split.md. Both leave the sync-fs gap list; the decisions are in the watchFile section of docs/fx-split.md.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: watchFile and unwatchFile are implemented in pure JS by stat polling over tjs.stat, with setInterval; a missing path reads as zeroed stats (ENOENT and ENOTDIR only); the watcher table is keyed by path and unwatchFile stops the interval when the last listener leaves; both are removed from FS_SYNC_NAMES and exported on fs | node --check passes | txiki contract present 115, missing []; gap names 45 (was 47) |
| test/parity-cases.js: 5 shared cases, each with a 20 ms interval and a 2000 ms deadline: the Node-shaped current and previous stats after a change; unwatch stopping events; a missing path giving one zeroed event; a path reporting once it appears; silence while unchanged. The helpers remove each watcher in a finally block | node --check passes; Node parity 181/181 | txiki parity 181/181, mismatches [], unexpectedGaps []; Node parity 181/181 |
| docs/fx-split.md: ranked row 3 marked done; the fs (sync) gap row drops the two names; a section with the decisions (missing path, sub-ms precision, return value, interval) | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-fs-watchfile.md: the Agent Note for the change | none | none |

## fx split: Phase B for fs.watchFile and fs.unwatchFile (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.19 s |
| node test/parity-node.js, runs 1 to 3 (timing cases) | 181/181 shared cases match each run; exit 0 each run (696, 738, 717 ms in runParity) | 0.81, 0.86, 0.87 s process |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 115, missing [] | 0.30 s probe |
| contract gap names under gm's txiki | 45 of the non-default names (was 47): fs.watchFile and fs.unwatchFile left the list | 0.32 s probe |
| parity under gm's txiki, runs 1 to 3 (timing cases) | shared 181, gapAsserted 5, gaps 14 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 each run (1074, 1154, 1082 ms in runParity) | 1.33, 1.45, 1.37 s probe |

## fx split: crypto.createHash under txiki (2026-11-19)

Ranked item 1 among the 45 remaining gap names (ranked list in docs/fx-split.md, "Remaining txiki gap names, ranked (2026-11-19, after crypto.createHash)").

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: createHash in pure JS for md5, sha1, sha256 and sha512 (SHA-2 constants derived from primes by integer roots, not typed in); Hash with update (string with encoding, or a view) and digest (Buffer, or a string encoding); digest twice and update after digest throw Digest already called; createHash names outside those four throw the gap message; the algorithm name is case-insensitive | node --check passes; 26 shared cases generated from Node's crypto output; Node parity 207/207 | txiki parity 207/207, mismatches []; sha3-256 gap asserted |
| test/parity-cases.js: 26 shared cases for the four digests on four inputs, chunked update, Buffer and hex input, base64 and latin1 digests, default Buffer, upper-case name, update with a number, digest twice, update after digest; gap case crypto.createHash sha3-256 replaces the old whole-name gap case | node --check passes | txiki gap names 44 (was 45) |
| docs/fx-split.md: the ranked list of the 45 remaining gap names with each line's class; the crypto gap row and the owner-decision bullet now record the implementation | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-crypto-createhash.md: Agent Note | none | none |

## fx split: Phase B for crypto.createHash (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.16 s |
| node test/parity-node.js (final), and earlier runs | 207/207 shared cases match; exit 0 (819 ms in runParity) | 1.01 s process |
| contract under gm's txiki (probe with the rebuilt gm-core) | present 115, missing [] | 0.29 s probe |
| contract gap names under gm's txiki | 44 of the non-default names (was 45): crypto.createHash left the list | 0.29 s probe |
| parity under gm's txiki, final run (probe with the rebuilt gm-core) | shared 207, gapAsserted 5, gaps 14 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 (1236 ms in runParity). Three earlier runs on the same tree: 1113, 1108, 1127 ms in runParity, all mismatches [] and exit 0 | 1.53 s probe |

## fx split: zlib.gunzip under txiki (2026-11-19)

Ranked item 2 in docs/fx-split.md. zlib.gunzip is an owned pure-JS inflate and gzip framing parser, checked against Node.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: gunzip (callback form, asynchronous delivery) over an owned RFC 1951 inflate (stored, fixed and dynamic blocks), RFC 1952 header parsing (FEXTRA, FNAME, FCOMMENT, FHCRC) and trailer checks (CRC-32, length); multi-member streams; errors with Node's codes and messages for the cases below; zlib.gzip stays a gap | node --check passes; Node parity 222/222 before the flag cases were added; see the Phase B table for the final run | txiki parity (see the Phase B table) |
| test/parity-cases.js: 11 fixture cases from Node's zlib output (stored, fixed, two dynamic, multi-member, trailing garbage, corrupt CRC, corrupt length, truncated, non-gzip bytes, empty input); 2 header-flag cases from Node's gunzipSync on patched bytes; 4 further cases (callback order, options argument, ArrayBuffer input, synchronous ERR_INVALID_ARG_TYPE); the existing bad-magic case loses its gap field; the zlib.gunzip gap case is removed | node --check passes | txiki gap names 43 (was 44) |
| docs/fx-split.md: the gap-table row, the owner-decision bullet, ranked item 2 marked done, and a gunzip section with the decisions | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-zlib-gunzip.md: Agent Note | none | none |

## fx split: Phase B for zlib.gunzip (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| swap-in at the start of each run | 948 KB/s (Node parity and contract), 460 KB/s (txiki parity), 864 KB/s (txiki contract and gap names); the earlier txiki run at 6084 KB/s is discarded | none |
| node test/parity-node.js | 224/224 shared cases match, including the 11 Node fixture cases and the 2 header-flag cases; exit 0 | 0.81 s process (702 ms in runParity) |
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.11 s |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 224, gapAsserted 4, gaps 13 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 1.33 s probe (1106 ms in runParity) |
| contract under gm's txiki | present 115, missing [] | 0.18 s probe |
| contract gap names under gm's txiki | 43 of the non-default names (was 44): zlib.gunzip left the list; zlib.gzip stays a gap | 0.21 s probe |

## fx split: child-process.execFile under txiki (2026-11-19)

Ranked item 5 in docs/fx-split.md. execFile is implemented in pure JS over tjs.spawn, checked against Node.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: execFile (callback form, optional callback; encoding option; any other option throws the gap message; errors shaped as Node's: exit code, signal name, ENOENT, cmd and "Command failed" message); captureExecFile, exitFailure, missingCommandError, decodeExecOutput and execFileArguments helpers; child_process exports execFile and keeps execFileSync, spawn and spawnSync as gaps | node --check passes | txiki parity 234 shared, mismatches [] |
| test/parity-cases.js: 8 shared cases from Node's execFile output (stdout and stderr; nonzero exit; encoding buffer; SIGTERM; SIGKILL with partial stdout; empty command; missing command; callback ordering); 1 callback-optional case; 1 gap case for option cwd asserted in the gap check. The helpers execText, execOutcome and callbackOrder live above them | node --check passes; Node parity 234/234 | txiki gap names 42 (see the Phase B table) |
| docs/fx-split.md: the execFile section with each decision and its reason; the child_process gap row; the owner-decision bullet and ranked item 5 marked done; the zlib.gzip byte-parity decision (kept a gap, byte parity open, with its reason) | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-child-process-execfile.md: Agent Note | none | none |

## fx split: Phase B for child-process.execFile (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| swap-in at the start of each run | 576 KB/s (Node parity and contract), 928 KB/s (txiki parity), 612 KB/s (txiki contract and gap names) | none |
| node test/parity-node.js | 234/234 shared cases match, including the 8 execFile cases, the callback-optional case, and the cwd gap case under Node; exit 0 | 1.13 s process (911 ms in runParity) |
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.18 s |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 234, gapAsserted 5, gaps 13 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 4.16 s probe (1368 ms in runParity) |
| contract under gm's txiki | present 115, missing [] | 0.52 s probe |
| contract gap names under gm's txiki | 42 of the non-default names (was 43): child-process.execFile left the list (child-process.execFileSync and child-process.spawn stay as gaps). zlib.gzip stays a gap | 0.18 s probe |

## fx split: child-process.spawn under txiki (2026-11-19)

Ranked item 6 in docs/fx-split.md. spawn is a pure-JS ChildProcess over tjs.spawn, checked against Node.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: startChild (tjs.spawn, with a synchronous throw turned into a value); ChildProcess with synchronous pid and kill (names, RangeError to a gap); on and once; spawn, exit and close delivered after setTimeout(0); a missing command as error then close -2; stdin, stdout and stderr throw the gap messages; any option throws the gap message; spawn is exported and spawnSync and execFileSync stay gaps | node --check passes; Node parity 242/242 | txiki parity 242 shared, gapAsserted 7, mismatches [] |
| test/parity-cases.js: 8 spawn cases from Node's spawn output (exit then close; SIGTERM after the spawn event; missing command; numeric pid after spawn; kill before spawn returns true; pid is a number before spawn; stdout gap; option cwd gap); the old child_process.spawn gap line is removed, because the name is implemented | node --check passes | txiki gap names 41 (was 42) |
| docs/fx-split.md: the spawn section with each decision and its reason, including the synchronous tjs.spawn finding; the child_process row, the owner-decision bullet and ranked item 6 updated | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-child-process-spawn.md: Agent Note | none | none |

## fx split: Phase B for child-process.spawn (2026-11-19)

| Witness | Result | Wall time |
|---|---|---|
| swap-in at the start of each run | 520 KB/s (Node parity), 520 KB/s (Node contract, same poll), 956 KB/s (txiki parity), 784 KB/s (txiki contract and gap names) | none |
| node test/parity-node.js | 242/242 shared cases match, including the 8 spawn cases and the 2 converted before-spawn cases; exit 0 | 1.00 s process (817 ms in runParity) |
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.12 s |
| parity under gm's txiki (probe with the rebuilt gm-core) | shared 242, gapAsserted 7, gaps 12 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 1.63 s probe (1257 ms in runParity) |
| contract under gm's txiki | present 115, missing [] | 0.19 s probe |
| contract gap names under gm's txiki | 41 of the non-default names (was 42): child-process.spawn left the list | 0.20 s probe |

## fx split: zlib.gzip as stored blocks under txiki (2026-11-19)

Ranked item 5 in docs/fx-split.md. zlib.gzip is a pure-JS stored-block encoder; zlib.gunzip is pure JS. Byte parity with Node's compressed output stays open.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: STORED_BLOCK_MAX, writeUint32LittleEndian, gzipBytes (10-byte header, stored blocks, CRC-32 and length trailer), gzip (callback form, zlib input, async done); gzip removed from the zlib gap list and exported | grep shows the functions and the export; node --check runs in Phase B | see Phase B |
| test/parity-cases.js: zlib.gzip round trip, header bytes and trailer lose the gap field and become shared; empty input checks the round trip only (the length 20 expectation is removed, because stored output differs in length); new cases: a 70000-byte round trip across two stored blocks and a trailer of [112, 17, 1, 0]; four gap fields removed | grep shows the cases | see Phase B |
| docs/fx-split.md: the stored-block section, the ranked item 5 row, the superseded markers on the earlier zlib decisions | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-zlib-gzip-stored.md: Agent Note | none | none |

## fx split: Phase B for zlib.gzip as stored blocks (2026-11-19)

Each run started only after a reading that was below 1000 KB/s for both swap-in and swap-out. Two earlier reruns in this step did not wait: the txiki contract started at swap-in 1272 KB/s, and the gap-name run started at swap-out 73640 KB/s. Their results matched (present 115, missing []; gapCount 40), but they are not witnesses. The witnesses are the gated reruns below.

| Witness | Result | Wall time |
|---|---|---|
| node test/parity-node.js (gate 228 / 0 KB/s, swap-in / swap-out) | 244/244 shared cases match; 0/0 gaps throw the documented message; exit 0 | 0.93 s process (801 ms in runParity) |
| node test/contract-node.js (gate 416 / 0 KB/s) | 115 names present across 25 subpaths; exit 0 | 0.12 s |
| parity under gm's txiki (gate 8 / 0 KB/s) | shared 244, gapAsserted 3, gaps 11 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 1.54 s probe (1329 ms in runParity) |
| contract under gm's txiki, gated rerun (gate 448 / 0 KB/s) | present 115, missing []; exit 0 | 0.53 s probe |
| contract gap names under gm's txiki, gated rerun (gate 336 / 28 KB/s) | gapCount 40 (was 41); zlib.gzip absent from the list; exit 0 | 0.33 s probe |

Caveat: the parity probe exited 0 on an earlier run in this step whose summary still reported unexpectedGaps (zlib.gzip resolved, from the gap entry removed afterwards). Exit 0 alone is therefore not the witness; the summary's mismatches [] and unexpectedGaps [] are. The witness above is the run after that entry was removed.

## fx split: streams under txiki (2026-11-19)

Ranked items 4, 7, 8, 9 and 10 in the owner-decision list. Pure JS, Node 24 as oracle; the decisions and their reasons are in the stream section of docs/fx-split.md.

| Change | Phase A evidence | Phase B witness |
|---|---|---|
| src/txiki.js: Emitter (on, once, listenerCount, emit; an error with no listener throws); the nextTick queue; the Writable, Readable and PassThrough classes; pipeline; FileReadStream and createReadStream; the option and gap helpers; ChildProcess now extends Emitter (its own on, once and emit removed); stream exports the real classes; fs exports createReadStream; createReadStream removed from the fs sync gap names; gapClasses removed (gapClass still used by other subpaths) | node --check passes (in Phase B); Node parity 262/262 | txiki parity 262 shared, gapAsserted 3, gaps 17 applied, gapInactive 1, mismatches [], unexpectedGaps [] |
| test/parity-cases.js: streamSettle, closedEvent and streamFile helpers; streamScenarios with 18 scenarios that mirror the Node probe; 18 shared cases with expectations from the probe output (one expectation changed from the probe's DIR placeholder to Node's message for the fixed path, confirmed by the Node run); 7 declared gap cases (highWaterMark on Readable and PassThrough, objectMode on Writable, encoding on createReadStream, read, cork, off); the stream.Readable gap entry removed | Node parity 262/262 | see above |
| docs/fx-split.md: the stream section with each decision and its reason; ranked and owner-decision rows marked done; the spawn error-listener line updated; the fs and stream rows updated | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-streams.md: Agent Note | none | none |

## fx split: Phase B for streams under txiki (2026-11-19)

Each run started after a reading below 1000 KB/s for both swap-in and swap-out, taken immediately before it. Run order and readings (swap-in / swap-out KB/s): Node parity 240 / 44, Node contract 12 / 0, txiki parity 28 / 0, txiki contract 264 / 0, txiki gap names 416 / 0.

| Witness | Result | Wall time |
|---|---|---|
| node test/parity-node.js | 262/262 shared cases match; 0/0 gaps throw the documented message; exit 0 | 3.26 s process (2790 ms in runParity) |
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.12 s |
| parity under gm's txiki | shared 262, gapAsserted 3, gaps 17 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0; no "parity failed" line | 2.29 s probe (2102 ms in runParity) |
| contract under gm's txiki | present 115, missing []; exit 0 | 0.17 s probe |
| contract gap names under gm's txiki | gapCount 35 (was 40); no stream or createReadStream names; exit 0 | 0.15 s probe |

Note: the txiki parity probe exits 0 even when runParity throws inside the body, because the body catches the error. The witness is the summary: mismatches [] and unexpectedGaps [] with no "parity failed" line.

Earlier in this step, a debugging run found that txiki's FileHandle.read returned a non-positive value at end of file, which the first version treated as data. The fix (count > 0) is in the committed code, and the witnesses above are from the fixed code.

## fx split: StringDecoder encodings under txiki (2026-11-19)

Reachable item 1 in the ranked list at the end of docs/fx-split.md.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: StringDecoder keeps utf8 on TextDecoder and decodes the other encodings through CODECS, with Node's carry rules: a base64 or base64url remainder of 1 or 2 bytes; a utf16le odd byte; a utf16le high surrogate at the end of a write. end() flushes the carried bytes as Node does. The gap for non-utf8 encodings is removed | node --check passes; Node parity 304/304 (the 42 new cases generated from the Node probe runs/analysis/sd-node.mjs) | txiki parity with mismatches [] and unexpectedGaps []; Node and txiki contract and gap-name probes |
| test/parity-cases.js: decoderBytes and decoderParts helpers; 40 cases (6 encodings: latin1, ascii, hex, base64, base64url, utf16le, plus the aliases binary and ucs2, each over 5 chunkings) with expectations from the Node probe; the base64 end-only case; the unknown-encoding case; the gap case for latin1 removed | Node parity 304/304 | txiki parity |
| docs/fx-split.md: the string_decoder row marked done, and the ranked list of reachable work with held items H1 to H10 and their reopen evidence | grep shows the rows | none |
| .agents/notes/implemented/architecture/2026-11-19-txiki-string-decoder.md: Agent Note | none | none |

## fx split: Phase B for StringDecoder encodings (2026-11-19)

Each run started after a reading below 1000 KB/s for swap-in and swap-out, taken immediately before it. Readings (swap-in / swap-out KB/s): Node parity 408 / 0, Node contract 104 / 0, txiki parity 152 / 0, txiki contract 184 / 0, txiki gap names 708 / 0.

| Witness | Result | Wall time |
|---|---|---|
| node test/parity-node.js | 304/304 shared cases match; 0/0 gaps throw the documented message; exit 0 | 3.15 s process (789 ms in runParity) |
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.08 s |
| parity under gm's txiki | shared 304, gapAsserted 3, gaps 16 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0; no "parity failed" line | 1.45 s probe (1253 ms in runParity) |
| contract under gm's txiki | present 115, missing []; exit 0 | 0.14 s probe |
| contract gap names under gm's txiki | gapCount 35, unchanged (StringDecoder was never a contract gap name); exit 0 | 0.14 s probe |

## fx split: fs.promises.cp of a symbolic link under txiki (2026-11-19)

Queue item 1 (cp of a symbolic link). The Node 24 oracle probes are runs/analysis/cp-link-node.mjs, cp-link-node2.mjs and cp-probe3-node.mjs (untracked). Rules recorded from them: a link copies as a link; a relative target is rewritten to an absolute path resolved against the source directory; dereference follows the link; EEXIST when a link replaces a regular file; ENOENT for a dangling dereference; the destination parent is created; a non-directory over a directory raises ERR_FS_CP_NON_DIR_TO_DIR and a directory over a non-directory raises ERR_FS_CP_DIR_TO_NON_DIR; the same file raises ERR_FS_CP_EINVAL; a missing source raises ENOENT from lstat.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: cp reads the source with lstat (stat under dereference), copies links with readLink and symlink, creates the destination parent, and raises the Node cp errors; fs.promises.readlink and fs.promises.symlink are added on top of tjs.readLink and tjs.symlink (argument order target then path, checked against the probe); the gap for a symbolic link is removed | the dev check of the new parity case passes under Node (27 expectations match Node) and under gm's txiki (same 27) | Node parity and txiki parity |
| src/fs-promises.js: re-exports readlink and symlink | none beyond the parity case | Node parity |
| test/parity-cases.js: cpLinkScenario and one shared case with 27 expectations taken from the probes | the Node dev check and the txiki dev check agree | Node parity and txiki parity |
| Not ported: the ERR_FS_CP_EINVAL check for a link copied into its own subdirectory, and the inode comparison for hard links (the same-file check compares realpaths instead). The dereferenced same-file case is probed and matches | none | none; an open divergence until a probe covers it |

## fx split: stream backpressure in pipe and Readable read() under txiki (2026-11-19)

Queue items 2 and 3. Both use one readable state machine in src/txiki.js: sync (starts true, false for PassThrough), needReadable, emittedReadable, readingMore, a set of awaitDrain destinations, and the pipes list. The Node 24 oracle probes are runs/analysis/pipe-node.mjs (4 cases), readable-node.mjs (7 cases) and stream-edge-node.mjs (2 cases; the pipe-into-destination-error case is left out because its unpipe order is not ported). Writable.writableNeedDrain is added, Emitter.once goes through on, and Readable.read is removed from the gap list.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Readable port of read(n), the readable event, pipe with pause on a false write and resume on drain, unpipe on finish or close, the push-after-end error, and the PassThrough transform start (sync false) | the dev check passes the 34 stream cases under Node and the same 34 under gm's txiki | Node parity and txiki parity |
| test/parity-cases.js: pipeBackpressure and readableWithListener helpers; 13 shared cases from the probes; the stream.Readable.read gap case removed | Node dev check: all 34 stream cases match Node | Node parity and txiki parity |
| docs/fx-split.md: items 2, 3 and 4 of the ranked list marked done with their probe files | none | none |
| Not ported: pipe error handling (the destination error listener that unpipes the source) and the public Readable.unpipe, which stays a gap name. The probe pipe-dest-error in runs/analysis/stream-edge-node.mjs shows a pause before end that this port does not reproduce, so that case is left out of the parity cases | none; an open divergence until probed and ported |

## fx split: buffer.constants and fs.constants O_* flags under txiki (2026-11-19)

Queue item 4. The Node 24 oracle probe is runs/analysis/constants-node.mjs (untracked): buffer.constants has MAX_LENGTH 9007199254740991 and MAX_STRING_LENGTH 536870888; fs.constants has 15 O_* flags. The host is x86_64 (uname -m). The txiki values are the same numbers as constants, so they are checked against Node on this host only.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: fs.constants gains the 15 O_* flags; buffer.constants gains MAX_LENGTH and MAX_STRING_LENGTH; both gap entries for these members are gone | the dev check passes both new cases under Node and under gm's txiki | Node parity and txiki parity |
| test/parity-cases.js: two shared cases (fs.constants O_* on this host; buffer.constants values); the fs.constants.O_RDONLY gap case removed | the same two cases match Node | Node parity and txiki parity |
| docs/fx-split.md: item 5 of the ranked list marked done, with the x86_64 caveat | none | none |

## fx split: Phase B for queue items 1 to 4 (2026-11-19)

Each run started after a reading below 1000 KB/s for swap-in and swap-out, taken immediately before it. Readings (swap-in / swap-out KB/s): Node parity 380 / 0, txiki parity 240 / 0, Node contract 68 / 0, txiki contract 352 / 0, txiki gap names 56 / 0.

| Witness | Result | Wall time |
|---|---|---|
| node test/parity-node.js | 321/321 shared cases match; 0/0 gaps throw the documented message; exit 0 | 3.24 s process (858 ms in runParity) |
| parity under gm's txiki (runs/analysis/parity-txiki-body.js) | shared 321, gapAsserted 3, gaps 14 applied (16 before the change), gapInactive 1, mismatches [], unexpectedGaps []; exit 0; no "parity failed" line | 2.00 s probe (1856 ms in runParity) |
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.08 s |
| contract under gm's txiki (runs/analysis/contract-txiki-body.js) | present 115, missing []; exit 0 | 0.15 s probe |
| contract gap names under gm's txiki (runs/analysis/contract-gaps-body.js) | gapCount 35, unchanged; exit 0 | 0.16 s probe |

The gap count fell from 16 to 14 because stream.Readable.read and fs.constants.O_RDONLY are no longer gap cases. The 35 contract gap names did not change.

## fx split: pipe and write error paths under txiki (2026-11-19)

Open divergence 1 from the Phase B record, ranked first in docs/fx-split.md. The Node 24 oracle probes are runs/analysis/pipe-error-node.mjs, writable-error-node.mjs and writable-destroy-queue-node.mjs (untracked). Rules recorded from them: a write that fails or lands on a destroyed stream returns false, so pipe pauses the source; a failed write calls back every queued write with the same error before the error event; a write after destroy calls back with ERR_STREAM_DESTROYED and emits nothing; a destroy with a write in flight emits close first, then the in-flight callback runs with its own result, then queued callbacks get ERR_STREAM_DESTROYED; pipe's destination error listener is prepended, unpipes the source, and re-emits only when no other error listener exists.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Writable.write returns false on a destroyed stream and calls back a write after destroy with ERR_STREAM_DESTROYED; a failed write fails the queued callbacks with the same error; destroy flushes the queue with the stream's error or ERR_STREAM_DESTROYED; Emitter.prepend is added; pipe prepends its error listener, unpipes on error, and re-emits only with no other listener | the dev check passes all 41 stream cases under Node (dev-stream-node.out) and the same 41 under gm's txiki (dev-stream-txiki.out) | Node parity and txiki parity |
| test/parity-cases.js: pipeFirstChunkFailure, pipeMultiChunkFailure, pipeDestroyWithoutError, writableQueuedAfterError, writableWriteAfterDestroy, writableDestroyInsideWrite, writableDestroyWithQueue; 7 shared cases from the probes | the same 7 match Node and txiki | Node parity and txiki parity |
| docs/fx-split.md: the ranked list rewritten (items 1 to 3 and the held items H1 to H10 with their reopen evidence) | none | none |

## fx split: Phase B for the pipe and write error paths (2026-11-19)

Each run started after a reading below 1000 KB/s for swap-in and swap-out, taken immediately before it. Readings (swap-in / swap-out KB/s): Node parity 20 / 0, txiki parity 80 / 0, Node contract 56 / 0, txiki contract 36 / 0.

| Witness | Result | Wall time |
|---|---|---|
| node test/parity-node.js | 328/328 shared cases match; 0/0 gaps throw the documented message; exit 0 | 3.23 s process (881 ms in runParity) |
| parity under gm's txiki (runs/analysis/parity-txiki-body.js) | shared 328, gapAsserted 3, gaps 14 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0; no "parity failed" line | 1.95 s probe (1805 ms in runParity) |
| node test/contract-node.js (not listed by the change; run as a check) | 115 names present across 25 subpaths; exit 0 | 0.07 s |
| contract under gm's txiki (not listed by the change; run as a check) | present 115, missing []; exit 0 | 0.14 s probe |

## fx split: public Readable.unpipe under txiki (2026-11-19)

Ranked item 2 in docs/fx-split.md. The Node 24 probe is runs/analysis/unpipe-node.mjs (untracked); it covers removing the first of two destinations, unpipe of a destination that is not piped, unpipe() with two destinations, resume after unpipe, and re-piping. The existing probes manual-unpipe-after-first-write and unpipe-all-no-pipes in pipe-error-node.mjs agree with it. Readable.unpipe leaves the declared gap list.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Readable.unpipe(destination) removes one destination through the internal path and returns the stream; unpipe() with no argument pauses once and emits unpipe on each destination; Readable.unpipe is removed from the declared gap names | the dev check passes the 5 unpipe cases under Node and under gm's txiki (dev-unpipe-node.out, dev-unpipe-txiki.out) | Node parity and txiki parity; the mutation check (the unpipe cases must fail when the public method is broken) |
| test/parity-cases.js: unpipeFirstOfTwo, unpipeNotPiped, unpipeAllOfTwo, unpipeThenResume, repipeAfterUnpipe with the wait helper; 5 shared cases from the probe | the same 5 match Node and txiki | Node parity and txiki parity |
| docs/fx-split.md: ranked item 2 marked done; item 3 kept held | none | none |

## fx split: Phase B for public Readable.unpipe (2026-11-19)

Each run started after a reading below 1000 KB/s for swap-in and swap-out, taken immediately before it. Readings (swap-in / swap-out KB/s): Node parity 564 / 0, txiki parity 972 / 0, Node contract 908 / 0, txiki contract 760 / 0.

| Witness | Result | Wall time |
|---|---|---|
| node test/parity-node.js | 333/333 shared cases match; 0/0 gaps throw the documented message; exit 0 | 3.69 s process (1213 ms in runParity) |
| parity under gm's txiki (runs/analysis/parity-txiki-body.js) | shared 333, gapAsserted 3, gaps 14 applied, gapInactive 1, mismatches [], unexpectedGaps []; exit 0; no "parity failed" line | 2.61 s probe (2276 ms in runParity) |
| node test/contract-node.js | 115 names present across 25 subpaths; exit 0 | 0.18 s |
| contract under gm's txiki (runs/analysis/contract-txiki-body.js) | present 115, missing []; exit 0 | 0.30 s probe |

Mutation check (a failing run of the txiki unpipe cases, not a witness): the public unpipe(destination) was changed to skip its internal call, and all 5 unpipe cases went red under gm's txiki (runs/analysis/dev-txiki-unpipe-body.js). The file was then restored with git checkout from the Phase A commit, and git status was clean. The txiki parity witness above ran on that same committed content.

## fx split: cp into its own subdirectory and the hard-link inode check (2026-11-19)

Ranked item 3 in docs/fx-split.md, reopened once tjs.stat was witnessed to return ino and dev. Probes (untracked, runs/analysis/): cp-subdir-hardlink-node.mjs (the link and hard-link cases), cp-selfcases-node.mjs (directory into its own subdirectory), stat-ino-body.js (txiki stat fields), cp-file-onto-link-node.mjs (the open file-onto-link divergence).

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: the same-file check compares ino and dev from statFor, replacing the realpath comparison; a directory copied into its own subdirectory raises ERR_FS_CP_EINVAL; a directory source whose link target is an ancestor of the destination link raises ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY; the link-to-link checks run only when the source link points at a directory | dev check: fs.promises.cp cases 3 of 3 match Node (dev-cp-node.out) and txiki total 3, failing [] (dev-cp-txiki.out) | Node parity and txiki parity; the mutation check (break the new check, its case must go red) |
| test/parity-cases.js: cpSubdirScenario (10 expectations) and cpSelfDirScenario (2 expectations), both from the probe outputs above | the same cases match Node and txiki | Node parity and txiki parity |
| docs/fx-split.md: ranked item 3 marked done, with the stat witness and the open file-onto-link divergence | none | none |

Open divergence (not ported): a regular file copied over an existing link to a regular file. Node raised a raw readlink EINVAL on one run and succeeded on another; txiki copies through the link. Reopen with a Node run that gives one stable result.

Contract name note: test/contract-names.js does not list fs-promises readlink or symlink, which the Readable and cp work added to src/fs-promises.js. The contract probe checks presence only, so it passes.
