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

## Phase B: cp into its own subdirectory and the hard-link inode check (2026-11-19)

Each run started after a vmstat reading with swap-in and swap-out below 1000 KB/s (the reading is recorded per row).

| Witness | Reading (swap-in / swap-out KB/s) | Result | Wall time |
|---|---|---|---|
| node test/parity-node.js | 360 / 0 (70 polls) | 335/335 shared cases match; 0/0 gaps throw the documented message; exit 0 | 3.70 s process (1454 ms in runParity) |
| parity under gm's txiki (runs/analysis/parity-txiki-body.js) | 620 / 0 | shared 335, gapAsserted 3, gaps 14, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 2.96 s probe (2514 ms in runParity) |
| node test/contract-node.js | 48 / 0 | 115 names present across 25 subpaths; exit 0 | 0.17 s |
| contract under gm's txiki (runs/analysis/contract-txiki-body.js) | 188 / 0 (5 polls) | present 115, missing []; exit 0 | 0.32 s probe |

Mutation check (not a witness): Readable's same-file helper sameFile in src/txiki.js was changed to return false, which removes the ino and dev comparison. Under gm's txiki (runs/analysis/dev-txiki-cp-body.js), the hard-link expectations went red: the cpSubdirScenario case (hard-link-same-inode, hard-link-src-is-dest-other-name, dereference-hard-link-same-inode) and the older "copies symbolic links" case (dereferenceExistingLinkDest, which also depends on the same-file error). The file was restored with git checkout from de7fbd93; git status was clean after the restore.

## fx split: a file copied onto an existing link, and a hard-linked overwrite (2026-11-19)

Item 1 of the queue after d269ae6a: the open divergence from the cp into own-subdirectory stretch. Probes (untracked, runs/analysis/): cp-file-onto-link-repeat-node.mjs (6 layouts, 3 fresh roots each, all identical), cp-file-onto-link-deref-node.mjs (plain and dereference), cp-dangling-deref-node.mjs (the link target is created through a dangling link), cp-overwrite-hardlink-node.mjs (sibling keeps its content; inode changes). The earlier EINVAL readlink was in the probe itself: its return value called readlink on the destination after cp had replaced the link with a regular file.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: a file copy unlinks an existing destination before tjs.copyFile, so a link is replaced (the dereferenced dangling link stays, and its target is created) and a hard-linked sibling keeps its content | dev check: the new cp case (the whole scenario) red before the fix (writes through the link, EISDIR on a link to a directory, sibling changed); green after the fix, 4 of 4 cp cases match Node (dev-cp-node.out) and txiki total 4, failing [] (dev-cp-green.out) | Node parity and txiki parity; the mutation (remove the unlink, the case must go red) |
| test/parity-cases.js: cpFileOntoLinkScenario (9 expectations plus the gone.txt text and the hard-link sibling) from the probe outputs | the same case matches Node and txiki | Node parity and txiki parity |

## contract names: fs-promises readlink and symlink (2026-11-19)

The contract list did not name readlink or symlink, which the Readable and cp work exported from src/fs-promises.js. Both are now listed (test/contract-names.js), so the contract count is 117 on each side.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| test/contract-names.js: fs-promises gains readlink and symlink | the contract probe: Node 117 names present, exit 0; txiki present 117, missing [] | Node contract and txiki contract |
| Mutation: src/fs-promises.js with the readlink export removed | Node contract exits 1 with "node is missing: fs-promises.readlink"; txiki contract reports "present":116,"missing":["fs-promises.readlink"] (its probe exits 0, the missing list is the red result); the file was restored and git status shows only contract-names.js | none |

## fx split: stream Emitter surface and a flaky destroy case (2026-11-19)

Ranked item 4 in docs/fx-split.md: the Emitter methods that Readable and Writable declared as gaps (addListener, prependListener, off, removeListener, removeAllListeners, listeners, eventNames). Probes (untracked, runs/analysis/): emitter-node.mjs (addListener flows, off, once listeners by function, listeners unwrapping, eventNames, prepend order, removeAllListeners events, finish via addListener, readable removal resetting flowing), emitter2-node.mjs (prependListener does not flow, off/removeAll of readable reset flowing after a tick, removeAllListeners() event order), writable-destroy-sync-node.mjs (the flaky case, below).

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Emitter gains addListener, prependListener, off, removeListener, removeAllListeners, listeners, eventNames; once records the original listener; detach drops an empty list; Readable.removeListener and removeAllListeners schedule updateReadableListening after a tick for readable; Readable gets the readableFlowing getter; the seven Emitter names are no longer declared gaps on Readable or Writable | dev: stream Emitter 16 of 16 match Node (dev-emitter-node.out) and txiki total 16, failing [] (/tmp/dev-emitter-txiki.out); mutation (removeListener made a no-op): 8 Emitter cases red, restored and checked with git diff | Node parity and txiki parity |
| test/parity-cases.js: 16 Emitter cases from the probe outputs | the same cases | Node parity and txiki parity |
| test/parity-cases.js: the destroy-with-write-in-flight case calls destroy() synchronously (its 2 ms write timer and a 0 ms destroy timer raced) | Node: writable-destroy-sync-node.mjs gives the saved expectation 10 of 10; dev check Node 10 of 10 SAME (it was 9 of 10 before); txiki 3 of 3 SAME | Node parity and txiki parity |

Regression check (not a witness): all stream and child dev cases on Node: 59 of 59 stream and 18 of 18 child match. On txiki, 75 cases with 3 reported as failing: the three child-process gap cases (execFile option cwd, spawn stdout, spawn option cwd). The dev harness does not assert gap cases; the parity runner does, in Phase B.

## fx split: remove the stream.Readable.off gap case (2026-11-19)

Found by Phase B: the txiki parity run (the first one, red) reported unexpectedGaps for stream.Readable.off, because the gap case still asserted that off throws. Its replacement is the Emitter cases in the previous commit (off removes the listener and returns the stream). The gap case is removed. Remaining gap cases: 13 on txiki, with stream.Writable.cork still a declared gap.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| test/parity-cases.js: gapCases loses stream.Readable.off | txiki parity rerun: unexpectedGaps [] (see the Phase B record) | the Phase B record |

## Phase B: queue items 1 to 3 after d269ae6a (2026-11-19)

Each run started after a vmstat reading with swap-in and swap-out below 1000 KB/s, taken immediately before it.

Run history for the parity witnesses. The first Phase B job ran Node parity and txiki parity once each, plus both contract probes. The txiki parity run was red: unexpectedGaps listed stream.Readable.off, a gap case that still asserted off throws (reading 392 / 0, wall 4.13 s). The fix removed that gap case (commit 7e9ef620). The two parity witnesses were then run again on the fixed tree; those reruns are the witnesses below. The Node parity run from the first job was green (352/352), and the rerun is the same. The contract probes were not rerun, because their code under test did not change.

| Witness | Reading (swap-in / swap-out KB/s) | Result | Wall time |
|---|---|---|---|
| node test/parity-node.js (rerun on the fixed tree) | 340 / 0 (1 poll) | 352/352 shared cases match; 0/0 gaps throw the documented message; exit 0 | 4.00 s process (1739 ms in runParity) |
| parity under gm's txiki (runs/analysis/parity-txiki-body.js, rerun) | 348 / 0 (1 poll) | shared 352, gapAsserted 3, gaps 13, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 4.38 s probe (3827 ms in runParity) |
| node test/contract-node.js | 528 / 0 (4 polls) | 117 names present across 25 subpaths; exit 0 | 0.20 s |
| contract under gm's txiki (runs/analysis/contract-txiki-body.js) | 852 / 0 (5 polls) | present 117, missing []; exit 0 | 0.33 s probe |

Phase A witnesses for items 1 to 3 (each change has its own mutation check, already in its section): the file-onto-link case (removing the unlink turns it red); the contract names (removing the readlink export turns the Node contract red with exit 1, and the txiki contract reports the missing name); the Emitter surface (making removeListener a no-op turns 8 Emitter cases red).

Note for the contract witness: the txiki contract probe exits 0 even when a name is missing; its missing list is the red result.

## fx split: Writable cork, uncork and setDefaultEncoding (2026-11-19)

Ranked item 5 in docs/fx-split.md, taken first because it is the Writable surface behind pipe (pipe itself is already ported; its shared cases pass). Probe: runs/analysis/stream-gaps-node.mjs (cork, uncork, double cork, writev under cork, end while corked, setDefaultEncoding hex with and without decodeStrings, the unknown-encoding error, and the writev backlog without cork). Expectations are the probe output.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Writable gains cork, uncork, writableCorked, setDefaultEncoding; writes buffer while corked; uncork and end flush through _write or, with two or more buffered and a writev option, through _writev; decodeStrings option; encodingOf throws with code ERR_UNKNOWN_ENCODING; the three names leave the Writable gap list | dev: 66 of 66 txiki stream cases pass with failing [] (verify-item1.out, after the mutation restore); Node dev 68 of 68 SAME (dev-item1-node.out) | Node parity and txiki parity |
| test/parity-cases.js: 9 Writable cases from the probe output; the stream.Writable.cork gap case is removed | the same cases | Node parity and txiki parity |
| Mutation: uncork without the flush makes 3 cork cases red; setDefaultEncoding ignoring the set value makes 2 cases red; each restored and checked | /tmp/mut-uncork.out and /tmp/mut-default.out | none |

## fx split: Readable.setEncoding (2026-11-19)

Ranked item 5, second of the six: Readable.setEncoding. Probe: runs/analysis/stream-gaps-node.mjs (utf8 split across pushes, hex on a Buffer, buffered data converted by setEncoding, the unknown-encoding error, read(n) counting characters, base64 holdback and end flush). The probe output sets every expectation.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Readable.setEncoding keeps a StringDecoder; push decodes, and an empty decoded string is not added; end flushes the decoder's rest; the buffer holds strings, and read and fromList join and slice by character | dev: 7 of 7 setEncoding cases match Node (dev-setenc-node.out) and txiki (dev-setenc-txiki.out, failing []) | Node parity and txiki parity |
| test/parity-cases.js: 7 setEncoding cases from the probe output | the same cases | Node parity and txiki parity |
| Mutation: push ignores the decoder, 3 cases red (utf8 split, hex on Buffer, base64); setEncoding throws, all 7 red; both restored and checked with grep | /tmp/mut-setenc.out and /tmp/mut2-setenc.out | none |

Regression (not a witness): stream dev cases on Node 75 of 75 SAME, and on txiki 73 total with failing [] (regress2-node.out, regress2-txiki.out).

## fx split: item 1 follow-up mutations (2026-11-19)

The Writable cork section above listed two mutations. Each of its nine cases needs a red mutation, so these were run as well. Each case is covered by the mutation named for it:

| Case | Red under |
|---|---|
| cork: writes buffer until uncork | uncork throws; cork throws |
| cork: corked backlog goes to _writev | uncork throws; writev disabled |
| cork: two cork calls | uncork throws; cork throws |
| uncork without cork | uncork throws |
| end uncorks a corked stream | cork throws; end does not flush |
| setDefaultEncoding hex | setDefaultEncoding throws |
| setDefaultEncoding decodeStrings false | setDefaultEncoding throws |
| setDefaultEncoding unknown encoding | setDefaultEncoding throws; setDefaultEncoding without validation |
| backlog of two or more writes goes to _writev | writev disabled |

Each of these mutations was applied, run under gm's txiki, and restored; the restores are checked by grep (the mutation markers and the original lines are present). One note: the end-does-not-flush restore failed the first time because the edit left a blank line; it was then restored with the exact text. The three mutations that ran after it were not affected, because their red results are read per case group, and the end-group red comes from the separate end mutation. (The first pass read the end-group result as red for three mutations that did not touch end; that was the unrestored end mutation, and the attribution above uses only the runs in which it was not in place.)

## fx split: Readable.unshift (2026-11-19)

Ranked item 5, third of the six: Readable.unshift. Probes: runs/analysis/stream-gaps-node.mjs (front insert, the hex string, the empty chunk, read after push(null), the Buffer and string under setEncoding) and stream-gaps2-node.mjs and stream-gaps3-node.mjs (the return value in four states, the error after the end event with its message, the Buffer and string under setEncoding). Expectations are the probe output.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Readable.unshift(chunk, encoding): an error after the end event (destroy with ERR_STREAM_UNSHIFT_AFTER_END_EVENT), false once destroyed, a string is decoded with its encoding (or converted to the decoder encoding when setEncoding is set), empty chunks add nothing, the return value is !ended && (length < hwm || length === 0); #addChunk takes a front flag; the name leaves the gap list | dev: 8 of 8 match Node (dev-unshift-node.out), and txiki total 8 with failing [] (dev-unshift-txiki.out) | Node parity and txiki parity |
| test/parity-cases.js: 8 unshift cases from the probe output | the same cases | Node parity and txiki parity |
| Mutation: unshift throws, all 8 unshift cases red; restored and checked with grep | /tmp/mut3-unshift.out | none |

Regression (not a witness): the stream dev cases on Node 83 of 83 with no DIFF, and txiki 81 with failing [] (regress3-node.out, regress3-txiki.out).

Not measured, so not claimed: unshift(null), unshift on a destroyed stream beyond the return value, and unshift while a decoder is set with a chunk other than a string or Buffer.

## fx split: Readable.wrap, with readableEnded, readableLength and destroyed (2026-11-19)

Ranked item 5, last of the six: Readable.wrap. Probes: runs/analysis/stream-gaps2-node.mjs (data, end, error, close, pause and resume, the end without a consumer) and runs/analysis/wrap-hwm-node.mjs (the same pause and resume with a 70000-byte chunk, because txiki has no highWaterMark option; the first probe used 16 bytes, which txiki cannot construct). The method-forwarding rule was measured in stream-gaps3-node.mjs. Expectations are the probe output.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: Readable.wrap listens for data, end, error and close on the old stream, pauses it when a push returns false and resumes it on the next read, and forwards the function-valued enumerable properties of the old stream that the stream lacks; Readable gets the readableEnded, readableLength and destroyed getters (the probes read them); the last Readable gap name leaves the gap list | dev: 9 of 9 wrap cases match Node (dev-wrap-node.out), and txiki 9 with failing [] (dev-wrap-txiki2.out, after the getters were added); regression: stream dev cases Node 92 of 92 with no DIFF, txiki 90 with failing [] (regress4-*.out) | Node parity and txiki parity |
| test/parity-cases.js: 9 wrap cases from the probe output | the same cases | Node parity and txiki parity |
| Mutation: wrap throws, all 9 wrap cases red; restored and checked by grep | /tmp/mut4-wrap.out | none |

Not measured, so not claimed: the wrap destroy event (the probe's old stream has no destroy emitter), a wrap over a stream whose resume is missing when paused, and Writable.destroyed, Writable.writableLength, writableEnded and writableFinished, which txiki also lacks; they are not declared gaps, so they are recorded here.

## Phase B: Writable surface, Readable setEncoding, unshift and wrap (2026-11-19)

Each run started after a vmstat reading with swap-in and swap-out below 1000 KB/s, taken immediately before it (the gate's poll count is in the log).

| Witness | Reading (swap-in / swap-out KB/s) | Result | Wall time |
|---|---|---|---|
| node test/parity-node.js | 624 / 0 (53 polls) | 385/385 shared cases match; 0/0 gaps throw the documented message; exit 0 | 4.13 s process (1913 ms in runParity) |
| parity under gm's txiki, with gap assertions (runs/analysis/parity-txiki-body.js) | 504 / 0 (49 polls) | shared 385, gapAsserted 3, gaps 12, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 4.17 s probe (3752 ms in runParity) |
| node test/contract-node.js | 888 / 0 (5 polls) | 117 names present across 25 subpaths; exit 0 | 0.20 s |
| contract under gm's txiki (runs/analysis/contract-txiki-body.js) | 608 / 0 (1 poll) | present 117, missing []; exit 0 | 0.19 s |

The gap count fell from 13 to 12 with the removal of stream.Writable.cork; no stream gap name remains declared.

Commits covered: 43abb221 (Writable surface), d72cc142 (setEncoding), 262cef9b (unshift), 7ec42357 (wrap). Each has its Phase A evidence and mutation record above.

## fx split: child-process.spawn stdout as a Readable (2026-11-19)

Rank 1 of the ranked list of declared gaps outside the stream group (docs/fx-split.md). Probe: runs/analysis/child-stdout-node.mjs, output runs/analysis/child-stdout-node.out (run twice; the exit and end order in the exitCode case differs between runs, so the cases assert order-independent facts).

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: ChildProcess.stdout is a Readable fed by a pump over tjs.spawn's stdout, started at spawn; backpressure applies once a consumer exists; close waits for the stdout stream to end when a consumer exists, and drains and discards it when none exists at exit; stdin and stderr stay gap getters | dev before the change: 8 child-process.spawn cases red (6 new stdout cases, the old stdout gap case, and the cwd gap case, which the dev harness does not assert); after the change: 15 total, failing only the cwd gap case | Node parity and txiki parity with gap assertions |
| test/parity-cases.js: 7 cases from the probe output; the old stdout gap case becomes a shared case with no gap marker; the late-read case reports a failed access as a rejection, not an uncaught error | the same dev runs | the same |

Mutation evidence (each mutation applied to the saved good file, run, then the file restored; each restore checked with cmp against the saved copy, and git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| M1: getter throws the gap again | the old stdout gap case; A; B; C; D; F; G |
| M2: pump pushes empty buffers | A; B; C; D |
| M3: close does not wait for stdout end | A; B; C; D |
| M4: unattached stream is not resumed at exit | E and F (TIMEOUT, targeted run). In the full run it hangs at the first existing spawn case, which has no per-case timeout |
| M5: pump pushes raw values | none: equivalent, because the stream converts pushes to Buffer |
| M5b: pump drops the first byte | A; B; C; D |
| M6: getter returns a new wrapper on each access | F; G |

Case letters: A carries Buffer chunks and ends before close; B delivers 70000 bytes; C setEncoding utf8 yields strings; D keeps output before a nonzero exit code; E closes without a stdout read and discards 70000 bytes; F read after close is empty; G is the same Readable on each access.

Regression (not a witness): Node child-process dev 25 of 25 SAME; txiki child-process dev failing only the two cwd gap cases; Node parity 392 of 392 (1947 ms); txiki parity with gap assertions shared 392, gapAsserted 2, gaps 12, gapInactive 1, mismatches [], unexpectedGaps [] (3973 ms). Runs that failed to launch because gm-core was being rebuilt (EACCES) were rerun and are not counted.

Not verified: destroy, pause and resume of the stdout stream while attached, the stdout close event, backpressure timing with a slow reader, and stdout after a spawn failure.

## Phase B: child-process.spawn stdout (2026-11-19)

Each run started after a vmstat reading with swap-in and swap-out below 1000 KB/s, taken immediately before it (the gate's poll count is in the log).

| Witness | Reading (swap-in / swap-out KB/s) | Result | Wall time |
|---|---|---|---|
| node test/parity-node.js | 460 / 0 (98 polls) | 392/392 shared cases match; 0/0 gaps throw the documented message; exit 0 | 4.72 s process (2009 ms in runParity) |
| parity under gm's txiki, with gap assertions (runs/analysis/parity-txiki-body.js) | 916 / 0 (1 poll) | shared 392, gapAsserted 2, gaps 12, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 3.70 s probe (3433 ms in runParity) |
| node test/contract-node.js | 664 / 0 (1 poll) | 117 names present across 25 subpaths; exit 0 | 0.09 s |
| contract under gm's txiki (runs/analysis/contract-txiki-body.js) | 240 / 0 (2 polls) | present 117, missing []; exit 0 | 0.17 s |

Commit covered: 76ec239f (child-process.spawn stdout as a Readable), on top of c46fad29. The gap-assertion count fell from 3 to 2 because the stdout gap case is now a shared case. The two asserted gaps are the cwd cases on execFile and spawn, which are ranked 3 in docs/fx-split.md.

## fx split: child-process.spawn stderr as a Readable (2026-11-19)

Rank 2 of the ranked list of declared gaps outside the stream group (docs/fx-split.md). Probe: runs/analysis/child-stderr-node.mjs, run twice with identical output. The stderr probe matches the stdout probe on every measured point, so the stderr cases use the same expectations shape as the stdout cases.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: openPipe builds a Readable over a tjs pipe and pumps it from spawn; stdout and stderr each get one; close waits for both ends, and a stream with no consumer at exit is resumed and drained; stderr getter returns its Readable; stdin stays a gap getter | dev before the change: 25 child-process.spawn cases, Node 25 SAME; txiki red on the 8 stderr cases (and the cwd gap case, which the dev harness does not assert). After the change: txiki 25 total, failing only the cwd gap case | Node parity and txiki parity with gap assertions |
| test/parity-cases.js: 10 stderr cases from the probe output (through pipeOutcome and pipesOutcome, which replace stdoutOutcome's body); the late read goes through lateRead, and its failure is a rejection, not an uncaught error | the same runs | the same |

Mutation evidence (the mutated file is run through the stderr progress body; each restore is checked with cmp against the saved copy, and git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| M1: stderr getter throws the gap again | carries; 70000; setEncoding; nonzero exit; separate; stderr read with stdout unread; late read; same object |
| M2: pump pushes empty buffers (shared pump, so stdout too) | carries; 70000; setEncoding; nonzero exit; separate; stdout read with stderr unread; stderr read with stdout unread |
| M3: close waits for stdout only | carries; setEncoding; nonzero exit; separate |
| M4: unconsumed streams are not resumed at exit | 70000; setEncoding; nonzero exit; stdout read with stderr unread; stderr read with stdout unread; no read and discard; late read |
| M6: getter returns a new wrapper on each access | carries; 70000; setEncoding; nonzero exit; separate; stderr read with stdout unread; late read; same object |
| M7: stderr pipe replaced by a closed pipe | carries; 70000; setEncoding; nonzero exit; separate; stderr read with stdout unread |

Case reading: each of the 10 stderr cases is red under at least one mutation (the no-read discard case under M4; the same-object case under M1 and M6).

Regression (not a witness): Node parity 402 of 402 (2487 ms). txiki parity with gap assertions: shared 402, gapAsserted 2, gaps 12, gapInactive 1, mismatches [], unexpectedGaps [] (3893 ms). The two asserted gaps are the cwd cases on execFile and spawn, which are still gaps.

Not verified: stderr destroy, pause and resume while attached, the stderr close event, and stderr after a spawn failure.

## fx split: child-process.execFile option cwd (2026-11-19)

Rank 3 of the ranked list in docs/fx-split.md, taken as execFile only, as the request named; spawn cwd is still a gap. exec is held: it is not a name in the runtime or the contract. Probe: runs/analysis/child-cwd-node.mjs, run twice with identical output.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: execFile accepts cwd; startExecFile starts the child synchronously and passes cwd only when it is defined; ENOENT and the other asynchronous codes go to the callback; other codes throw synchronously as 'spawn <code>' | dev before the change: 6 execFile cwd cases red on txiki (each hit the gap throw); Node 6 of 6 SAME. After the change: txiki 6 of 6 pass; the child-process group on Node 40 of 40 with no DIFF; on txiki only the spawn cwd gap case fails | Node parity and txiki parity with gap assertions |
| test/parity-cases.js: 6 cases from the probe output, replacing the execFile cwd gap case | the same runs | the same |

Mutation evidence (each mutation applied to the saved good file, run through the cwd dev body, restored; each restore checked with cmp against the saved copy, and git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| Ma: cwd is not passed to tjs.spawn | sets the working directory; runs in a named directory; missing directory; file as cwd |
| Mb: the gap throw is restored for cwd | sets the working directory; runs in a named directory; relative path; missing directory; file as cwd; undefined cwd |
| Mc: the missing-directory error is thrown instead of delivered (first attempt was a syntax error, so it was redone) | missing directory |
| Md: ENOTDIR is delivered asynchronously | file as cwd |
| Me: cwd is pinned to '/' | runs in a named directory; relative path; missing directory; file as cwd |

Case reading: each of the six cases is red under at least one mutation.

Regression (not a witness): Node parity 407 of 407 (2471 ms). txiki parity with gap assertions: shared 407, gapAsserted 1, gaps 12, gapInactive 1, mismatches [], unexpectedGaps [] (3911 ms). The one asserted gap is spawn cwd.

Not verified: the asynchronous codes EACCES, EAGAIN, EMFILE and ENFILE (their timing is from Node's source, not probed); errno numbers; cwd with a relative path containing a symlink.

## Phase B: child-process stderr and execFile cwd (2026-11-19)

Each run started after a vmstat reading with swap-in and swap-out below 1000 KB/s, taken immediately before it (the gate's poll count is in the log).

| Witness | Reading (swap-in / swap-out KB/s) | Result | Wall time |
|---|---|---|---|
| node test/parity-node.js | 52 / 904 (4 polls) | 407/407 shared cases match; 0/0 gaps throw the documented message; exit 0 | 5.06 s process (2461 ms in runParity) |
| parity under gm's txiki, with gap assertions (runs/analysis/parity-txiki-body.js) | 348 / 0 (2 polls) | shared 407, gapAsserted 1, gaps 12, gapInactive 1, mismatches [], unexpectedGaps []; exit 0 | 4.07 s probe (3917 ms in runParity) |
| node test/contract-node.js | 96 / 28 (5 polls) | 117 names present across 25 subpaths; exit 0 | 0.09 s |
| contract under gm's txiki (runs/analysis/contract-txiki-body.js) | 80 / 0 (1 poll) | present 117, missing []; exit 0 | 0.15 s |

Commits covered: eec48dd2 (child-process.spawn stderr as a Readable, sharing the stdout pump) and d8719a45 (child-process.execFile option cwd), on top of 79c9a2e0. The gap-assertion count is 1: the spawn cwd gap, which is still open.

## fx split: child-process.spawn option cwd (2026-11-19)

Rank 4 of the ranked list in docs/fx-split.md, and the last asserted gap in the parity run. Probe: runs/analysis/child-spawn-cwd-node.mjs, run twice with identical output.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: one startProcess serves spawn and execFile, with cwd passed only when defined; ENOENT and the other asynchronous codes become an error object carrying syscall, path and spawnargs, which ChildProcess reports as an error event then close -2; other codes throw synchronously; spawn accepts cwd; execFile adds cmd to its error; the missing-command helper is replaced by spawnError | dev before the change: the 6 spawn cwd cases red on txiki (gap throw), Node 12 of 12 SAME across execFile and spawn cwd. After the change: 12 of 12 on txiki; the child-process group is clean on txiki (failing []) and 45 of 45 SAME on Node | Node parity and txiki parity with gap assertions |
| test/parity-cases.js: 6 spawn cwd cases from the probe output, replacing the gap case; a spawnErrorOutcome helper records the error event's fields | the same runs | the same |

Mutation evidence (each mutation applied to the saved good file, run through the cwd dev body, restored; each restore checked with cmp against the saved copy; git status shows only the two changed files):

| Mutation | Spawn cases red |
|---|---|
| Sa: cwd is not passed to startProcess | sets the working directory; runs in a named directory; missing directory; file as cwd |
| Sb: the gap throw is restored for cwd | sets the working directory; runs in a named directory; relative path; missing directory; file as cwd; undefined cwd |
| Sc: the missing-directory error is emitted synchronously, before a listener exists | missing directory |
| Sd: ENOTDIR is delivered asynchronously (first run crashed the body on an unhandled error event, so it was rerun with a per-case progress file) | file as cwd |
| Se: cwd is pinned to '/' | runs in a named directory; relative path; missing directory; file as cwd; undefined cwd |
| Sf: the error has no path | missing directory |

Case reading: each of the six spawn cwd cases is red under at least one mutation.

Regression (not a witness): Node parity 412 of 412 (2495 ms). txiki parity with gap assertions: shared 412, gapAsserted 0, gaps 12, gapInactive 1, mismatches [], unexpectedGaps [] (3981 ms). No gap case is asserted now.

Not verified: EACCES, EAGAIN, EMFILE and ENFILE timing, errno numbers, and a missing directory reached through a symlink.

## fx split: fs.createReadStream option encoding (2026-11-19)

Rank 5 of the ranked list in docs/fx-split.md. Rank 4 (util.parseArgs with no args) was probed first and held: see its line there.

| Change | Phase A evidence | Phase B witness needed |
|---|---|---|
| src/txiki.js: createReadStream checks the encoding name (ERR_INVALID_ARG_VALUE TypeError, Node's message) and calls setEncoding on the FileReadStream; only the encoding key is accepted | pre-change on txiki: 8 of 12 encoding cases red (gap throw), 12 of 12 SAME on Node; after the change: 12 of 12 on txiki; the stream group is clean on txiki (failing []) and Node's stream group matches 92 of 92 | Node parity and txiki parity with gap assertions |
| test/parity-cases.js: 9 cases from the probe output (the old gap case is replaced); readStreamOutcome helper records events, chunk types and text | the same runs | the same |

Mutation evidence (each applied to the saved good file, run through the createReadStream dev body, restored; each restore checked with cmp against the saved copy, and git status shows only the changed files):

| Mutation | createReadStream cases red |
|---|---|
| Ka: setEncoding is never called | string argument; options object; multibyte split; hex |
| Kb: the gap throw is restored for encoding | string argument; options object; multibyte split; hex; null; empty file; missing file; unknown encoding |
| Kc: setEncoding always uses latin1 | multibyte split; hex |
| Kd: the unknown-encoding error has the wrong code | unknown encoding |
| Kf: utf8 is forced when no encoding is given | no encoding (Buffers); encoding null (Buffers) |

Regression (not a witness): Node parity 421 of 421 (2986 ms). txiki parity with gap assertions: shared 421, gapAsserted 0, gaps 11, gapInactive 1, mismatches [], unexpectedGaps [] (4931 ms).

Not verified: base64 and latin1 file encodings beyond the one mutation, start and end, file descriptors, symlinks, and pause and resume with an encoding set.

## Phase B: spawn cwd (c1c58990) and createReadStream encoding (5a90d278), 2026-11-19

Swap gate: `vmstat 1 2 | tail -1`, polled until swap-in (column 7) and swap-out (column 8) were both under 1000 KB/s. It passed on poll 82 of 82 with si 164 KB/s and so 0 KB/s. The first poll read si 8560 and so 88128, and the trace was high for the first 81 polls.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 421/421 shared cases match; 0/0 gaps throw the documented message; 3049 ms | 5.85 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 421, gapAsserted 0, gaps 11, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 4745 | 5.30 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.18 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.30 s |

Wall times are measured around each command in sequence, so they include process startup. The txiki runs include the mcp-probe launch.

Gap assertions: the gap cases are checked through the gaps count with unexpectedGaps []. After the spawn cwd and createReadStream encoding changes, 11 gap cases remain and all throw their documented messages (gapInactive 1). gapAsserted is not a gap count: it counts shared-case entries that carry a gap field, and none do, so it is 0 by construction. The spawn cwd section above also said gapAsserted 0 meant no gap was asserted; that reading was wrong.

Not verified in Phase B: the timing trace is one reading of the swap gate, and the wall times are single runs, not averages.

## fx split: crypto.createHash algorithms and options, Phase A (2026-11-19)

Rank 6. See the createHash section in docs/fx-split.md for the Node facts and the design.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: sha224, sha384, sha512-224, sha512-256 (initial values derived from the primes and the SHA-512/t rule); sha3-224/256/384/512 and shake128/256 (Keccak-f[1600] on BigInt lanes); createHash throws the gap for any option key | txiki dev body on the 'crypto.createHash' cases: 0 failing after the fix (the SHA-224 fix is recorded in fx-split.md); Node dev check on the same filter: 96 SAME, 0 DIFF; txiki parity with gap assertions: shared 491, mismatches [], unexpectedGaps [], gaps 10 before the option gap was added and 11 after |
| test/parity-cases.js: 28 SHA-2-variant cases and 42 SHA-3/SHAKE cases, generated from the Node probe output; the sha3-256 gap case is removed (sha3-256 is now a shared case); a gap case for createHash option outputLength | the same runs |

Mutation evidence (each applied to the saved good file, run through the createHash dev body, which writes its full result to a file because the printed output truncates; each restore checked with cmp against the saved copy; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| Ma: sha224 uses the SHA-256 initial value | sha224: empty, abc, long, non-ASCII, chunked, base64 (6) |
| Mb: sha224 output length 32 | sha224: the 6 above and default length (7) |
| Mc: sha384 uses the SHA-512 initial value | sha384: the 6 digest cases (6) |
| Md: sha384 output length 64 | sha384: 7 |
| Me: sha512-224 output length 32 | sha512-224: 7 |
| Mf: sha512-256 uses the SHA-512/224 initial value | sha512-256: the 6 digest cases (6) |
| Mg: SHA-512/t initial values without the a5 XOR | sha512-224 and sha512-256: 12 |
| Mh: sha224 gap restored | sha224: 7 |
| Mi: sha512-256 output length 28 | sha512-256: 7 |
| Mk1: round-constant bit positions shifted | sha3-224/256/384/512, shake128/256: 36 (the six non-length cases each) |
| Mk2: rotation offset plus one | the same 36 |
| Mk3: sha3-256 domain byte 0x1f | sha3-256: 6 |
| Mk4: shake128 output length 32 | shake128: 7 |
| Mk5: sha3-512 rate 136 | sha3-512: 6 |
| Mk6: sha3-384 gap restored | sha3-384: 7 |
| Mk7: rho rotation dropped | the same 36 |
| Mk8: chi without the NOT | the same 36 |
| Mk9: sha3-224 output length 32 | sha3-224: 7 (the default-length case) |
| Mk10: sha3-256 output length 16 | sha3-256: 7 |
| Mk11: sha3-512 output length 32 | sha3-512: 7 |
| Mk12: shake256 output length 16 | shake256: 7 |
| Gap: createHash option check removed | the gap case crypto.createHash option outputLength: reported as unexpectedGaps with the message "resolved" |

Coverage: every one of the 28 SHA-2-variant cases and the 42 SHA-3/SHAKE cases is red under at least one mutation. The SHA-3 union was checked from the mutation results (the Mk4 and Mk6 results were recorded in the earlier pass, and the Mk9 to Mk12 pass covered the default-length cases).

Earlier mutation counts of 27 for Mk1 and Mk2 came from truncated printed output, not from a missing case. The file-based run shows 36.

Not verified: outputs longer than the rate; shake outputLength (a declared gap); the other gap names in this section.

## fx split: crypto.createHash RIPEMD-160 and BLAKE2, Phase A (2026-11-19)

Rank 6, the remainder of the item: see the RIPEMD and BLAKE2 section in docs/fx-split.md.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: ripemd160 (80-step two-line compression on 32-bit words); blake2b512 (12 rounds, BigInt words, SHA-512 IV, parameter block for length 64); blake2s256 (10 rounds, SHA-256 IV, parameter block for length 32) | txiki dev body on the 'crypto.createHash' cases: 0 failing of 120 (the 24 new cases included); Node dev check on the same filter: 120 SAME, 0 DIFF; txiki parity with gap assertions: shared 515, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1; Node parity 515/515 |
| test/parity-cases.js: 24 cases for the three names, generated from the Node probe output (empty, abc, 200 bytes, non-ASCII, exact 128-byte block, chunked, default digest length, Buffer base64) | the same runs |

Mutation evidence (each applied to the saved good file, run through the createHash dev body that writes its full result to a file; each restore checked with cmp against the saved copy; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| R1: the rho permutation's last entry 8 → 9 | ripemd160: the 7 digest cases (not the default length) |
| R2: right constant 0x7a6d76e9 → 0x7a6d76e8 | ripemd160: 7 |
| R3: round function 2 (x OR NOT y) XOR z made AND | ripemd160: 7 |
| R4: ripemd160 output cut to 16 bytes | ripemd160: 8 (includes the default length) |
| B1: BLAKE2b runs 10 rounds, not 12 | blake2b512: 7 |
| B2: BLAKE2b parameter block without the output length | blake2b512: 7 |
| B3: BLAKE2b final-block flag removed | blake2b512: 7 |
| B4: BLAKE2b output cut by 8 bytes | blake2b512: 8 (includes the default length) |
| S1: BLAKE2s rotation 12 → 11 | blake2s256: 7 |
| S2: BLAKE2s output cut by 4 bytes | blake2s256: 8 (includes the default length) |
| S3: blake2s256 gap restored | blake2s256: 8 |

Coverage: every one of the 24 new cases is red under at least one mutation, computed from the full result files (no uncovered names).

Regression (not a witness): txiki parity with gap assertions: shared 515, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1, 5082 ms. Node parity: 515/515, 3131 ms.

Not verified: keyed BLAKE2 (not part of createHash here); inputs over one megabyte.

## Phase B: crypto.createHash (0a184257 and 7d3f2903), 2026-11-19

Swap gate: `vmstat 1 2 | tail -1`, awk columns 7 and 8. Passed on poll 1 of 1: si 60 KB/s, so 0 KB/s.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 515/515 shared cases match; 0/0 gaps throw the documented message; 3312 ms | 5.98 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 515, gapAsserted 0 (structural, see below), gaps 11, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 4973 | 5.29 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.20 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.29 s |

Wall times are single runs in sequence, and include process startup and the mcp-probe launch for the txiki runs.

Reading the gap numbers: the gap assertions are the gaps count with unexpectedGaps []. gapAsserted counts shared-case entries that carry a gap field, and none do, so it is 0 by construction (corrected in the spawn cwd section above).

Re-probe of util.parseArgs with no arguments (held, rank 4 in docs/fx-split.md): gm-core serve exits before initialize when extra arguments are given, with or without a -- separator, and tjs.args stays [] under serve (runs/analysis/dev-txiki-tjsargs-body.js). No standalone tjs binary is on the machine, so the held item stays held.

Not verified in Phase B: one run per witness, so the wall times are single readings, and the txiki parity run is on the gm-core host only.

## fx split: child-process.spawn stdin, Phase A (2026-11-19)

Rank 7 of the ranked list in docs/fx-split.md (done this stretch). Probe: runs/analysis/child-stdin-node.mjs, deterministic.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: startProcess takes a stdin flag (spawn sets it, execFile does not); ChildProcess keeps a stdin Writable from openWritable (write through the pipe's writer, final closes it, _destroy closes it); a failed start gets a discarding Writable; the stdin getter returns it; Writable gains the writable getter (false after end, destroy or a failure) | before the change: the stdin gap threw; after it: 7 of 7 cases match on txiki (dev body) and 7 of 7 on Node; the first run hung on the write-after-end case (destroy did not close the pipe), fixed by the _destroy close and recorded below |
| test/parity-cases.js: 7 stdin cases generated from the probe output (string write, two writes, no writes, binary, 300000 bytes, write after end, missing command), with a timeout in each helper; writableAfterEnd recorded after end() | the same runs |

Mutation evidence (each applied to the saved good file, run through the stdin dev body that writes its full result to a file; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| X1: the stdin gap restored | all 7 |
| X2: writes not forwarded to the pipe | string, two writes, binary, 300000 bytes, write after end (5) |
| X3: never closed (final and destroy both skip the close; cat waits forever, so the helper timeout reports TIMEOUT) | string, two writes, no writes, binary, 300000 bytes, write after end (6) |
| X4: destroy does not close the pipe (the bug the first run found) | write after end (1) |
| X5: writable always true | string, two writes, no writes, binary, write after end (5) |
| X6: discarding stdin reports an error on each write | missing command (1) |
| X7: only the first byte of each chunk written | string, binary, 300000 bytes, write after end (4) |

Coverage: every one of the 7 cases is red under at least one mutation. The X3 mutant leaves cat waiting; no cat process was left after the runs (checked with ps).

Regression (not a witness): txiki parity with gap assertions: shared 522, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1, 4320 ms. Node parity: 522/522.

Not verified: EPIPE when writing to a child that has exited; a user-called destroy before end.

## fx split: child-process option env, Phase A (2026-11-19)

Rank 7b in docs/fx-split.md. Probe: runs/analysis/child-env-node.mjs, deterministic (the parent's HOME is /config).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: startProcess takes { cwd, env, stdin } and passes env through processEnv (undefined dropped, others String); spawn and execFile accept the env key; ChildProcess takes the options object | before the change: spawn and execFile threw the env gap; after it: the 12 env cases match on txiki (dev body) and Node; txiki parity with gap assertions: shared 534, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1; Node parity 534/534 |
| test/parity-cases.js: 12 env cases generated from the probe output (FOO, inherited HOME control, empty env, env command, number, equals and space, env with cwd, undefined dropped, null, execFile FOO, execFile empty env) | the same runs |

A case was removed: "spawn without env inherits PATH". Under the mutation that makes the default env empty it still passed, because /bin/sh sets its own default PATH when none is given. The HOME control covers the same point and does detect it, so the PATH case was not discriminating.

Mutation evidence (each applied to the saved good file, run through the env dev body that writes its full result to a file; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| E1: env not forwarded to tjs.spawn | 11 |
| E2: PATH added to every env | 6 |
| E3: undefined values kept (String gives 'undefined') | 1 |
| E4: null becomes the empty string | 1 |
| E5: spawn env gap restored | 9 |
| E6: execFile env gap restored | 2 |
| E7: an empty env object treated as absent | 3 |
| E8: cwd dropped when env is given | 1 |
| E9: execFile env not forwarded | 2 |
| E10: default env empty (no env inherits nothing) | 1 |

Coverage: every one of the 12 cases is red under at least one mutation (the uncovered check ran over the names of the good run before the PATH case was removed; after the removal the remaining 12 are all covered by the same mutation runs).

Regression (not a witness): txiki parity with gap assertions: shared 534, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1, 4220 ms. Node parity: 534/534, 2541 ms.

Not verified: non-string env values beyond null and undefined, env keys containing '=', PATH lookup of a bare command under a custom env.

## Phase B: child-process stdin (aa2c1817) and option env (e2bde3d2), 2026-11-19

Swap gate: `vmstat 1 2 | tail -1`, awk columns 7 and 8. Passed on poll 42 of 42: si 68 KB/s, so 0 KB/s. The first poll read si 8400 and so 152, so the trace was high for the first 41 polls.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 534/534 shared cases match; 0/0 gaps throw the documented message; 2810 ms | 5.44 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 534, gapAsserted 0 (structural: it counts shared entries with a gap field), gaps 11, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 4234 | 4.41 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.08 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.14 s |

Wall times are single runs in sequence, and include process startup and the mcp-probe launch for the txiki runs.

Scope note: this stretch produced two Phase A changes (stdin and env), not one. Both are covered by this single Phase B.

Not verified in Phase B: one run per witness; the txiki parity run is on the gm-core host only.

## fx split: child-process timeout and killSignal, Phase A (2026-11-19)

Rank 7c in docs/fx-split.md. Probe: runs/analysis/child-timeout-node.mjs (deterministic); txiki reachability body runs/analysis/dev-txiki-timeout-body.js.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: captureExecFile arms a timer when timeout > 0 and kills with killSignal, exitFailure sets killed; ChildProcess arms its own timer and clears it in #reap; spawn and execFile accept timeout and killSignal; killSignalOf limits names to ten probed ones; timeoutOf requires a non-negative number | before the change: both keys threw the gap; after it: the 9 new cases match on txiki (dev body) and Node; txiki parity with gap assertions: shared 543, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1, 13893 ms; Node parity 543/543 |
| test/parity-cases.js: 9 cases generated from child-timeout-node.out (execFile timeout SIGTERM, SIGKILL, SIGINT, partial stdout, not reached, timeout 0; spawn timeout SIGTERM, SIGUSR1, timeout 0); the execFile helper now reports killed, cmd and message | the same runs |

Mutation evidence (each applied to a saved copy of the good file; the dev body writes full results to /tmp/timeout-result.json; each restore checked with cmp, then git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| T1: execFile timer absent | 4 |
| T2: execFile kills with SIGTERM whatever killSignal says | 2 |
| T3: execFile killed never set | 4 |
| T4: execFile timer armed at timeout 0 | 1 |
| T5: spawn timer absent | 2 |
| T6: spawn kills with SIGTERM whatever killSignal says | 1 |
| T7: execFile timeout and killSignal gaps restored | 6 |
| T8: spawn timeout and killSignal gaps restored | 3 |
| T9: spawn kill leaves killed false | 2 |

Coverage: all 9 cases are red under at least one mutation (uncovered []). Not discriminated: removing clearTimeout after wait (nothing in the cases observes a timer left armed after exit); no case covers the killSignal name check (a non-listed name still gaps, but no case asserts it).

Regression (not a witness): txiki parity with gap assertions: shared 543, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1. Node parity: 543/543.

Not verified: fractional timeouts; names outside the ten; numeric killSignal.

## Phase B: child-process timeout and killSignal (fa3f67b1), 2026-11-19

Swap gate: `vmstat 1 2 | tail -1`, awk columns 7 and 8. Passed on poll 15 of 15: si 540 KB/s, so 700 KB/s. The first poll read si 8932 and so 1604.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 543/543 shared cases match; 0/0 gaps throw the documented message; 5443 ms | 5.83 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 543, gapAsserted 0 (structural: it counts shared entries with a gap field), gaps 11, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 12232 | 12.57 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.16 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.33 s |

Wall times are single runs in sequence and include process startup and the mcp-probe launch for the txiki runs.

Not verified in Phase B: one run per witness; the txiki parity run is on the gm-core host only.

## fx split: child-process shell, Phase A (2026-11-19)

Rank 7d in docs/fx-split.md. Probes: runs/analysis/child-shell-node.mjs (deterministic with --no-deprecation) and runs/analysis/child-timer-node.mjs (deterministic).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: shellArguments (shell true wraps in /bin/sh -c with args joined by spaces, undefined and false pass through, any other value is a gap); execFile and spawn accept the shell key | before: both threw the gap; after: the 10 shell and timer cases match on txiki (dev body) and Node; txiki parity with gap assertions: shared 554, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1, 12065 ms; Node parity 554/554 |
| test/parity-cases.js: 9 shell cases generated from child-shell-node.out, plus 2 timer cases from child-timer-node.out (execFile and spawn, each run past the 100 ms timeout with a 300 ms wait) | the same runs |

Item 4 (left-armed timer after wait), from the earlier gap in fa3f67b1:
- execFile: observable. A timer left armed fires after the process was reaped, calls kill, and txiki throws ESRCH: no such process (native). The throw is uncaught, so it aborts the whole run rather than one case. The execFile timer case therefore fails under that mutation.
- spawn: not observable from a case. ChildProcess.kill returns false once #exited is set, so the leftover timer does nothing. Mutation S9 (clearTimeout removed from #reap) leaves the spawn timer case green: the case passes. Only the process lifetime would change, and no case measures that.

Mutation evidence (saved good copy; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| S1: shell ignored | run aborted: unhandled spawn error event for 'echo $FOO' (spawn ENOENT), no result file |
| S2: args joined with '+' | 2 |
| S3: execFile shell gap restored | 6 |
| S4: spawn shell gap restored | 2 |
| S5: shell false treated as true | 1 |
| S6: default (undefined) shell gapped | 2 (includes the execFile timer case, which the default-shell mutation also turns into a gap throw) |
| S7: no -c flag | 7 |
| S8: timer left armed in captureExecFile | run aborted: ESRCH from kill (native); no result file |
| S9: spawn timer left armed in #reap | 0 (spawn timer case stays green, as recorded above) |

Coverage: all 10 shell and timer cases are red under at least one mutation, except the two cases recorded under S8 and S1 run aborts, which fail the run rather than a single case. uncovered [].

Regression (not a witness): txiki parity with gap assertions: shared 554, mismatches [], unexpectedGaps [], gaps 11, gapInactive 1. Node parity: 554/554.

Not verified: shell as a path string; shell metacharacters beyond the cases; the DEP0190 warning.

## Phase B: child-process shell (731b2754), 2026-11-19

Swap gate: `vmstat 1 2 | tail -1`, awk columns 7 and 8. Passed on poll 1 of 1: si 32 KB/s, so 0 KB/s.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 554/554 shared cases match; 0/0 gaps throw the documented message; 5214 ms | 5.31 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 554, gapAsserted 0 (structural: it counts shared entries with a gap field), gaps 11, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 11702 | 11.87 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.11 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.19 s |

Wall times are single runs in sequence and include process startup and the mcp-probe launch for the txiki runs.

Not verified in Phase B: one run per witness; the txiki parity run is on the gm-core host only.

## fx split: fs.promises.writeFile flags and mode, Phase A (2026-11-19)

Rank 7e in docs/fx-split.md. Probes: runs/analysis/write-flags-node.mjs (deterministic, umask 22) and the inline txiki probe (/tmp/wf-txiki.json, 22 operations, matching Node on all 22; the ax+ existing case was added after that probe and is checked by the parity run).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: writeFile accepts flags w, wx, w+, wx+, a, ax, a+, ax+, r+ and a numeric mode; every flag goes through tjs.open(path, flag, mode) and a write loop; other flags and string modes stay gaps | before: flag other than w/a and any mode threw the gap; after: 23 writeFile cases (22 generated from write-flags-node.out plus ax+ existing) and 5 existing writeFile cases match on txiki (dev body) and Node; txiki parity with gap assertions: shared 577, mismatches [], unexpectedGaps [], gaps 13, gapInactive 1, 11970 ms; Node parity 577/577 |
| test/parity-cases.js: 23 cases generated from the Node output (new file per case, including EEXIST, ENOENT, appends, r+ overwrite, mode 0o600 on creation, mode ignored on an existing file, default mode); 2 gap cases (flag rs+, mode '0600') | the same runs |

Mutation evidence (saved good copy; the dev body runs all writeFile cases and gap cases and writes full results to /tmp/wf-mut-result.json; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| M1: flag ignored (always w) | 14 |
| M2: mode ignored (always 0o666) | 4 |
| M3: wx not exclusive | 2 |
| M4: ax not exclusive | 1 |
| M5: wx+ not exclusive | 1 |
| M6: ax+ not exclusive | 1 |
| M7: r+ treated as w | 3 |
| M8: flag gate restored to w and a | 15 |
| M9: mode gate restored | 7 |
| M10: mode applied to an existing file too | 13 |
| M11: w does not truncate | 3 |
| M12: flag gap check removed | 1 (the rs+ gap case) |
| M13: mode gap check removed | 1 (the mode gap case) |
| M14: a does not create | 7 |

Coverage: every case is red under at least one mutation (uncovered []).

Two harness notes from this stretch: the first version of the two gap cases called s.fs.promises, which does not exist on the txiki side, so they threw a TypeError rather than the gap message (corrected to s['fs-promises'], the same handle as fsp). A first mutation pass also left "fs.promises.writeFile flag a creates a missing file" uncovered; M14 covers it.

Regression (not a witness): txiki parity with gap assertions: shared 577, mismatches [], unexpectedGaps [], gaps 13, gapInactive 1. Node parity: 577/577.

Not verified: flags rs+, as, as+; string modes; umask other than 022.

## Phase B: fs.promises.writeFile flags and mode (8bd86e95), 2026-11-19

Correction in this record: the Phase A text said the txiki probe covered 21 operations. It covered 22 (the ax+ existing case was added afterwards and is checked by the parity run).

Swap gate: `vmstat 1 2 | tail -1`, awk columns 7 and 8. Passed on poll 1 of 1: si 368 KB/s, so 0 KB/s.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 577/577 shared cases match; 0/0 gaps throw the documented message; 5220 ms | 5.32 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 577, gapAsserted 0 (structural: it counts shared entries with a gap field), gaps 13, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 12149 | 12.31 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.10 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.14 s |

Wall times are single runs in sequence and include process startup and the mcp-probe launch for the txiki runs.

Not verified in Phase B: one run per witness; the txiki parity run is on the gm-core host only; default-mode cases assume umask 022.

## fx split: child-process uid and gid, Phase A (2026-11-19)

Rank 7f in docs/fx-split.md. Probes: runs/analysis/child-uid-node.mjs (deterministic) and the inline txiki probe (/tmp/uid-txiki.json; ids 1000 and 1000).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: startProcess takes uid and gid and sets them on tjs.spawn; idOption (number or gap); spawn and execFile accept the keys | before: both keys threw the gap; after: the 9 uid and gid cases (same uid, same gid, undefined uid, uid and gid of another user or group throwing EPERM, for spawn and execFile) and 2 gap cases match on txiki (dev body) and Node; txiki parity with gap assertions: shared 586, mismatches [], unexpectedGaps [], gaps 15, gapInactive 1, 12529 ms; Node parity 586/586 |
| test/parity-cases.js: 9 uid and gid cases generated from child-uid-node.out (the ids come from /proc/self/status, which works on Node and txiki); 2 gap cases (uid '1000' and gid '1000') | the same runs |

Mutation evidence (saved good copy; the dev body runs the uid and gid cases and gap cases, full results in /tmp/uid-mut-result.json; each restore checked with cmp, git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| U1: uid not forwarded | 2 (the uid EPERM cases, spawn and execFile) |
| U2: gid not forwarded | 2 (the gid EPERM cases) |
| U3: spawn key gap restored | 7 (includes the 2 gap cases) |
| U4: execFile key gap restored | 4 |
| U5: execFile uid dropped (gid still forwarded) | 1 |
| U6: non-number id gap removed | 2 (the gap cases) |
| U7: EPERM moved to the async path | run aborted: the spawn error event has no listener in the case, so the run stops (no result file) |
| U8: uid defaults to 0 | 3 |
| U9: uid off by one | 2 (the same-uid cases) |
| U10: gid off by one | 2 (the same-gid cases) |

Coverage: all 11 cases are red under at least one mutation (uncovered []).

Regression (not a witness): txiki parity with gap assertions: shared 586, mismatches [], unexpectedGaps [], gaps 15, gapInactive 1. Node parity: 586/586.

Not verified: supplementary groups; the root id; a valid uid without a passwd entry.

## fx split: child-process detached (held), Phase A evidence (2026-11-19)

Rank 7g in docs/fx-split.md. Probes: runs/analysis/child-detached-stdio-node.mjs (deterministic) and the inline txiki probe (/tmp/detached-stdio-txiki.json).

| Change | Phase A evidence |
|---|---|
| test/parity-cases.js: one case that a child without detached stays in the parent's session (the session script run through spawn, PARENT_SID from the test process via a child shell, fixed to use $$); one gap case for spawn option detached | the same runs |

No source change: detached stays a gap because txiki ignores the option.

Mutation evidence (saved good copy; the dev body runs the detached cases and the gap case; each restore checked with cmp, git status shows only the test file):

| Mutation | Cases red |
|---|---|
| D1: every spawn wrapped in setsid | 1 (the session case: sid_is_pid yes, same_session no) |
| D2: detached key allowed (no gap) | 1 (the gap case) |

Coverage: both cases are red under a mutation (uncovered []). Defect found during this change, not in the product code: a replace with a '$$' in the replacement collapsed the shell pid to '$', so the session script read /proc/$/stat; the fix uses split/join (replace treats '$$' as a literal '$' in its replacement string). The session case was red on the good code before the fix, and green after it.

Regression (not a witness): txiki parity with gap assertions: shared 587, mismatches [], unexpectedGaps [], gaps 16, gapInactive 1, 12282 ms. Node parity: 587/587.

Not verified: detached with a process group kill; setsid wrapper behaviour beyond the session check.

## fx split: child-process stdio, Phase A (2026-11-19)

Rank 7h in docs/fx-split.md. Probes: runs/analysis/child-detached-stdio-node.mjs (deterministic) and the inline txiki probe (/tmp/detached-stdio-txiki.json; routing read from the child's fd targets).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: startProcess takes a stdio triple; stdioOf normalises spawn's stdio ('pipe' or 'inherit' as a string or three-entry array, else the gap); ChildProcess nulls inherited streams and #reap waits only on piped ones; spawn accepts the stdio key | before: stdio threw the gap; after: the 2 stdio cases match on txiki (dev body) and Node; the 'ignore' gap case matches; txiki parity with gap assertions: shared 589, mismatches [], unexpectedGaps [], gaps 17, gapInactive 1, 14164 ms; Node parity 589/589 |
| test/parity-cases.js: 2 stdio cases generated from child-detached-stdio-node.out (inherit: the three streams null and fds equal; array: stdout inherited, stdin and stderr piped, fd 1 equal); 1 gap case (stdio 'ignore') | the same runs |

Same commit, a test-margin fix (recorded here so the history is clear): the two timer cases used a 100 ms timeout. One run failed with the child killed by the timer before it ran (`sh -c 'echo ok'`), while vmstat showed swap-in activity; the rerun passed. The timeout is now 1000 ms and the wait 1300 ms (the Node probe child-timer-node.mjs was regenerated with the same values; expected values unchanged). Mutation S8 (execFile timer left armed) still aborts the run; S9 (spawn timer left armed) still stays green.

Mutation evidence (saved good copy; each restore checked with cmp, git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| S1: inherit forced to pipe | 3 (both stdio cases and the ignore gap case) |
| S2: stdin inherit ignored | 1 (the inherit case) |
| S3: stdout inherit ignored | 2 (both stdio cases) |
| S4: spawn stdio key gap restored | 3 (both cases and the gap case) |
| S5: stdio value gap removed | 1 (the ignore gap case) |
| S6: a null stdout reported as undefined | 2 (both cases) |
| S7: #reap waits on the null streams | run hangs or aborts (no result file; the null stream is dereferenced at close) |

Coverage: each stdio case and the gap case is red under at least one mutation (uncovered []). S7 is a hang, not a per-case red, and is recorded as such.

Regression (not a witness): txiki parity with gap assertions: shared 589, mismatches [], unexpectedGaps [], gaps 17, gapInactive 1. Node parity: 589/589.

Not verified: 'ignore'; the ENOENT path with inherit; reading from an inherited stdin.

## Phase B: child-process uid and gid, detached (evidence), and stdio (f8a2b447, 3c423f15, 5cbca548), 2026-11-19

Swap gate: `vmstat 1 2 | tail -1`, awk columns 7 and 8. Passed on poll 51 of 51: si 332 KB/s, so 0 KB/s. The first poll read si 2404 KB/s.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 589/589 shared cases match; 0/0 gaps throw the documented message; 7536 ms | 7.65 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 589, gapAsserted 0 (structural: it counts shared entries with a gap field), gaps 17, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 14226 | 14.64 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.08 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.15 s |

Wall times are single runs in sequence and include process startup and the mcp-probe launch for the txiki runs.

Not verified in Phase B: one run per witness; the txiki parity run is on the gm-core host only; the stdio routing check is by fd target, not by text (see the stdio section).

## fx split: os.platform and process.platform, Phase A (2026-11-19)

Rank 7i in docs/fx-split.md (owner decision). Probes: runs/analysis/platform-node.mjs (deterministic) and the inline txiki probe (/tmp/platform-txiki.json: no tjs.platform; /proc/sys/kernel/ostype and uname -s both read Linux).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: kernelName() spawns uname -s once at load; PLATFORM_BY_UNAME maps the name to Node's platform name; osPlatform feeds os.platform and process.platform; an unknown name or failed spawn leaves both gaps | before: os.platform and process.platform threw the gap; after: the 3 platform cases match on txiki (dev body) and Node; txiki parity with gap assertions: shared 592, mismatches [], unexpectedGaps [], gaps 15, gapInactive 1, 14099 ms; Node parity 592/592 |
| test/parity-cases.js: 3 cases generated from platform-node.out (os.platform 'linux', process.platform 'linux', and os.platform agreeing with uname -s 'Linux'); the two gap cases for os.platform and process.platform removed (they now resolve) | the same runs |

Mutation evidence (saved good copy; the dev body runs the platform cases; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| P1: Linux mapped to freebsd | 3 |
| P2: every kernel name mapped to darwin | 3 |
| P3: process.platform removed (gap again) | 1 |
| P4: os.platform gap restored | 2 |
| P5: uname queried with -o (no match, so gap) | 3 |

Coverage: all 3 cases are red under at least one mutation (uncovered []).

Limit, recorded: a hard-coded 'linux' would pass all three cases on this Linux host, because the Linux value is also the derived one. The uname agreement case is the one that would catch it on a macOS host (uname -s would then read Darwin); that host was not available, so this is unmeasured.

Regression (not a witness): txiki parity with gap assertions: shared 592, mismatches [], unexpectedGaps [], gaps 15, gapInactive 1. Node parity: 592/592.

## fx split: child-process.execFile maxBuffer, Phase A (2026-11-19)

Rank 7j in docs/fx-split.md. Probes: runs/analysis/five-node.mjs (deterministic; the maxBuffer cases) and the txiki probe (through mcp-probe; the key-check gap for each case).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: maxBufferOf (default 1 MiB, non-number or negative gap); maxBufferError (RangeError, ERR_CHILD_PROCESS_STDIO_MAXBUFFER); signalChild (kill ignoring ESRCH); readCapped (counted reader, kills and cancels on overflow, returns the truncated bytes); captureExecFile takes maxBuffer and reports the overflow; execFile accepts the maxBuffer key | before: every maxBuffer case threw the gap; after: the 7 shared maxBuffer cases match on txiki (dev body) and Node; the gap case 'child-process maxBuffer abc' matches; txiki parity with gap assertions: shared 599, mismatches [], unexpectedGaps [], gaps 16, gapInactive 1, 15094 ms; Node parity 599/599 |
| test/parity-cases.js: 7 shared cases generated from five-node.out (the execRecord helper calls execFile and records error shape, stdout length, stdout head); 1 gap case (non-number maxBuffer) | the same runs |

Mutation evidence (saved good copy; the dev body runs the maxBuffer cases on txiki; each restore checked with cmp; git status shows only the two changed files; names listed once):

| Mutation | Cases red |
|---|---|
| M1: overflow ignored | 5 (the overflow, large, default and zero cases) |
| M2: default limit unbounded | 1 (the default 1 MiB case) |
| M3: output not truncated to the limit | 5 (the overflow cases) |
| M4: key gap restored | 5 shared cases and the gap case |
| M5: wrong error code | 4 (the overflow cases) |
| M6: no kill on overflow | 0: not observable (the cancel closes the pipe and the child exits by EPIPE; the error does not expose the signal); recorded as uncovered |
| M7: no cancel on overflow | run hangs (no result, the probe's timeout); the defect this step fixes |

Coverage: each maxBuffer case is red under at least one mutation, except the kill step (M6), which is uncovered.

Regression (not a witness): txiki parity with gap assertions: shared 599, mismatches [], unexpectedGaps [], gaps 16, gapInactive 1. Node parity: 599/599.

## fx split: child-process signal, Phase A (2026-11-19)

Rank 7k in docs/fx-split.md. Probes: runs/analysis/five-node.mjs (deterministic) and the txiki probe through mcp-probe (gap for each signal case before the change).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: signalOf (AbortSignal-like or gap); execFile listens for abort while the child runs, kills with killSignal, and reports abortError; execFile does not start a child for an already-aborted signal; spawn's ChildProcess listens for abort, emits error and kills; an already-aborted signal kills at once and emits error on the next timer; the listener is removed on reap; spawn accepts the signal key | before: the 4 signal cases threw the gap; after: the 4 cases match on txiki (dev body) and Node; the gap case 'child-process signal abc' matches; txiki parity with gap assertions: shared 603, mismatches [], unexpectedGaps [], gaps 17, gapInactive 1, 14433 ms; Node parity 603/603 |
| test/parity-cases.js: 4 shared cases generated from five-node.out (two execFile, two spawn with the events record); 1 gap case (non-object signal) | the same runs |

Mutation evidence (saved good copy; the dev body runs the signal cases on txiki; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| S1: execFile abort flag missing (mid-run error becomes the exit error) | 1 (execFile mid-run) |
| S2: execFile abort without kill | 0: not observable (the child ends in 5 s and the callback still gets AbortError); recorded as uncovered |
| S3: already-aborted execFile spawns the child | 1 (execFile pre-aborted) |
| S4: spawn abort listener not wired | 2 (both spawn cases) |
| S5: already-aborted spawn not killed | 1 (spawn pre-aborted) |
| S6: spawn key gap restored | 2 (both spawn cases) |
| S7: signal gap check removed | 1 (the gap case) |
| S8: spawn abort error not emitted | 1 (spawn mid-run) |

Coverage: every signal case is red under at least one mutation; S2 is the one uncovered mutation.

Regression (not a witness): txiki parity with gap assertions: shared 603, mismatches [], unexpectedGaps [], gaps 17, gapInactive 1. Node parity: 603/603.

## fx split: child-process killSignal as a number, Phase A (2026-11-19)

Rank 7l in docs/fx-split.md. Probes: runs/analysis/five-node.mjs (deterministic) and the txiki probe through mcp-probe (gap for each numeric case before the change).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: LINUX_SIGNAL_NUMBERS (ten Linux numbers mapped to the KILL_SIGNALS names); killSignalOf maps a number only when osPlatform is 'linux'; any other value keeps the gap, now with the value in the message | before: the 5 numeric cases threw the gap; after: the 5 numeric cases match on txiki (dev body) and Node; the gap case 'child-process killSignal 99' matches; txiki parity with gap assertions: shared 608, mismatches [], unexpectedGaps [], gaps 18, gapInactive 1, 15121 ms; Node parity 608/608 |
| test/parity-cases.js: 5 shared cases generated from five-node.out (execFile 9, 2, 15 and the 'SIGKILL' name; spawn 9); 1 gap case (99, outside the table) | the same runs |

Mutation evidence (saved good copy; the dev body runs the numeric cases on txiki; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| K1: table entry 9 mapped to SIGTERM | 2 (execFile 9 and spawn 9) |
| K2: numeric branch removed (numbers gapped again) | 4 (the numeric cases with a number) |
| K3: platform guard removed | 0: not observable on Linux; recorded as uncovered |
| K4: entry 15 missing | 1 (execFile 15) |

Coverage: each numeric case is red under at least one mutation; K3 is the one uncovered mutation (the Linux-only guard cannot be tested on this host).

Regression (not a witness): txiki parity with gap assertions: shared 608, mismatches [], unexpectedGaps [], gaps 18, gapInactive 1. Node parity: 608/608.

## fx split: child-process windowsHide, Phase A (2026-11-19)

Rank 7m in docs/fx-split.md. Probes: runs/analysis/five-node.mjs (deterministic: windowsHide true on spawn and execFile, false on execFile; each matches the no-option output) and the txiki probe through mcp-probe (gap for each windowsHide case before the change).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: windowsHideChecked accepts undefined or a boolean and gaps any other value; execFile and spawn accept the windowsHide key and call the check | before: the 3 cases threw the gap; after: the 3 cases match on txiki (dev body) and Node; the gap case 'child-process windowsHide yes' matches; txiki parity with gap assertions: shared 611, mismatches [], unexpectedGaps [], gaps 19, gapInactive 1, 15588 ms; Node parity 611/611 |
| test/parity-cases.js: 3 shared cases generated from five-node.out (spawn true, execFile true, execFile false); 1 gap case (a string value) | the same runs |

Mutation evidence (saved good copy; the dev body runs the windowsHide cases on txiki; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| W1: execFile key gap restored | 3 (the 2 execFile cases and the gap case) |
| W2: spawn key gap restored | 1 (the spawn case) |
| W3: validator removed | 1 (the gap case) |
| W4: false rejected by the validator | 1 (the execFile false case) |

Coverage: every windowsHide case is red under at least one mutation.

Regression (not a witness): txiki parity with gap assertions: shared 611, mismatches [], unexpectedGaps [], gaps 19, gapInactive 1, 15588 ms. Node parity: 611/611.

## fx split: crypto.createHash outputLength on non-XOF, Phase A (2026-11-19)

Rank 7n in docs/fx-split.md. Probes: runs/analysis/five-node.mjs (deterministic; the outputLength cases) and the txiki probe through mcp-probe (gap before the change).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: notXofError (Error, code ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH, the Node message); createHash accepts the outputLength key; a shake* name with outputLength gaps; a number equal to the algorithm's digest size is accepted, any other number throws notXofError; a non-number gaps | before: the outputLength cases threw the gap; after: the 6 shared outputLength cases match on txiki (dev body) and Node; the gap cases 'crypto.createHash outputLength abc' and 'crypto.createHash shake256' match; txiki parity with gap assertions: shared 617, mismatches [], unexpectedGaps [], gaps 20, gapInactive 1, 15226 ms; Node parity 617/617 |
| test/parity-cases.js: 6 shared cases generated from five-node.out (sha256 32, md5 16, sha512 64 accepted; sha256 16 throws on digest and at createHash; sha256 32 creates); 2 gap cases ('abc' value; shake256, which replaced the old option gap whose probe used shake256) | the same runs |

Mutation evidence (saved good copy; the dev body runs the outputLength cases and the shake gap on txiki; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| H1: length check reversed | 6 (every shared outputLength case) and the gap case that asserts no option gap is not affected |
| H2: length check removed | 2 (the two mismatch cases) |
| H3: key gap restored | 6 shared cases and the abc gap case |
| H4: wrong error code | 2 (the mismatch cases) |
| H5: non-number gap removed | 1 (the abc gap case) |
| X1: shake gap removed | 1 (the shake256 gap case) |

Coverage: every outputLength case and both gap cases are red under at least one mutation.

Regression (not a witness): txiki parity with gap assertions: shared 617, mismatches [], unexpectedGaps [], gaps 20, gapInactive 1. Node parity: 617/617.

## Phase B: os.platform and process.platform, child-process maxBuffer, signal, killSignal (number), windowsHide, crypto.createHash outputLength (1dfe3930, cd95559f, 669638d0, 3e6c8100, 77c65a0c, 0d762ffc), 2026-11-19

Swap gate: `vmstat 1 2 | tail -1`, awk columns 7 and 8 (si, so). Readings in order: 556/0, 92/0, 7924/0 (first three, before the witnesses); 772/0 (open, Node witnesses started); 2344/0 (after the Node witnesses); 100452/0 (closed, before txiki parity; the gate loop kept sampling); 332/0 (open, txiki parity started); 500/0 (open, txiki contract started); 40/0 (after). Both directions were below 1000 KB/s at each start.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 617/617 shared cases match; 0/0 gaps throw the documented message; 8253 ms | 8.36 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 617, gapAsserted 0 (structural), gaps 20, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 15028 | 15.25 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.09 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.23 s |

Wall times are single runs in sequence. The txiki times include the mcp-probe launch and the job wait.

Harness note (affects how the txiki witnesses were obtained, not their result): in this session the gm host returned a background stub for run_code, and the probe exited before the body's result arrived, so the txiki witnesses printed no result. runs/analysis/mcp-probe.mjs (gitignored, not part of the repo) was changed to send resources/read for skill://gm/SKILL.md before the body, and, when run_code returns a background job, to poll gm.job_status until the job finishes and print the final output. The witness command is unchanged; the probe's poll loop is what delivers the result.

Not verified: macOS (the platform cases were verified on Linux only); Windows; one run per witness.

## fx split: child-process stdio 'ignore' and execFile stdio, Phase A (2026-11-19)

Rank 7o in docs/fx-split.md (the first reachable item in the ranked list of the previous REPORT). Probes: runs/analysis/stdioignore-node.mjs (deterministic apart from socket inode numbers, normalised in the cases), runs/analysis/stdioinherit-execfile-node.mjs (deterministic), and the txiki probe through mcp-probe (gap for each form before the change, plus the raw tjs fd targets).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: stdioOf accepts 'ignore' per slot; ChildProcess treats any non-pipe slot as absent (noStdin, noStdout, noStderr); execFile accepts the stdio key and ignores it | before: the 3 'ignore' forms and the execFile key threw the gap; after: the 6 new cases match on txiki (dev body) and Node; the gap 'child-process stdio foo' matches; txiki parity with gap assertions: shared 623, mismatches [], unexpectedGaps [], gaps 20, gapInactive 1, 15482 ms; Node parity 623/623 |
| test/parity-cases.js: 6 shared cases generated from the Node probes (spawn ignore: three streams null and exit 0; ignore on stdin and stderr with fd targets; ignore on stdout with its socket target; the 300000-byte flood; execFile ignore; execFile inherit), with the socket inode normalised; a helper spawnCollect and execCapture; the gap 'child-process stdio ignore' replaced by 'child-process stdio foo' (still a gap) | the same runs |

Mutation evidence (saved good copy; the dev body runs the stdio cases on txiki; each restore checked with cmp; git status shows only the two changed files):

| Mutation | Cases red |
|---|---|
| G1: 'ignore' treated as a piped slot | 4 (all four spawn ignore cases) |
| G2: stdin 'ignore' passed as a pipe | 1 (the fd 0 case) |
| G3: stderr 'ignore' passed as a pipe | 1 (the fd 0 and fd 2 case) |
| G4: stdio value gap restored for 'ignore' | 4 (the four spawn ignore cases) |
| G5: execFile stdio key gap restored | 2 (the two execFile cases) |

Coverage: every stdio case is red under at least one mutation.

Regression (not a witness): txiki parity with gap assertions: shared 623, mismatches [], unexpectedGaps [], gaps 20, gapInactive 1. Node parity: 623/623.

## Phase B: child-process stdio 'ignore' and execFile stdio (cafe0989), 2026-11-19

Gate: `vmstat 1 2`, second sample (si, so, KB/s), with `ps` checked for build jobs (zig, cargo, rustc, clang, gcc, ninja, make, tsc). Readings in order, second sample each: 164/0, 1168/0 (closed), 76/0, 136/6272 (closed), 6328/16900 (closed), 80/0 (open) at the start; then 436/0 (open, Node witnesses started); 76/2568 (closed, after the Node witnesses); 768/3048 (closed, before the txiki parity wait); 676/0 (open, txiki parity started); 100/0 (open, txiki contract started); 384/0 (open, after). The build-job check was empty at every reading.

Other peers' load seen in the ps snapshots: a gm-core worker (about 44% CPU) and chromium renderers and a playwriter process, none of them build jobs.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js | node: 623/623 shared cases match; 0/0 gaps throw the documented message; 8167 ms | 8.26 s |
| txiki parity with gap assertions | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/parity-txiki-body.js | label txiki, shared 623, gapAsserted 0 (structural), gaps 20, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 15106 | 15.40 s |
| Node contract | cd packages/util/runtime && node test/contract-node.js | node: 117 names present across 25 subpaths | 0.10 s |
| txiki contract | node runs/analysis/mcp-probe.mjs <gm-core> /workspace/freddie runs/analysis/contract-txiki-body.js | present 117, missing [] | 0.16 s |

Probe runs in this stretch (all bounded, all ended by themselves; no probe was restarted under a new PID): the txiki stdio probe (timeout 120, about 15 s before the poll returned); the txiki flood probe (timeout 120); the txiki mutation loop (each probe timeout 120, 5 probes); the txiki regression (timeout 150, about 15 s); the Phase B txiki witnesses (timeout 150 and 120). The mcp-probe poll loop (runs/analysis, gitignored) was reduced from 40 polls to 3, so a stuck run ends in about 3 minutes rather than 40.

Not verified: the txiki witnesses ran in one run each; macOS and Windows.

## fx split: stream options (highWaterMark, Writable objectMode, encoding), Phase A (2026-11-19)

Rank 7p in docs/fx-split.md. Node probes: runs/analysis/stream-shapes2-node.mjs and stream-shapes3-node.mjs (run once each, exit 0, under timeout 60). Node values used as expected: a Readable with highWaterMark 3 gives push returns [true, false, false] and readableLength 4; a Writable with objectMode and highWaterMark 3 and a held callback gives write returns [true, true, false, false]; a Writable with highWaterMark 5 gives [true, false, false] for 3, 2 and 1 bytes; a PassThrough with highWaterMark 2 gives write false; encoding hex on a Readable or PassThrough gives the chunk '6162' as a string; an encoding of utf8 across split pushes gives 'é'. Default highWaterMark is 65536 for Readable and Writable and 16 for an objectMode Writable.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: highWaterMarkOf (non-negative integer, else gap); Readable keeps its limit in #highWaterMark (replacing the module constant in its 8 uses) and takes an encoding option; Writable takes highWaterMark and objectMode (objects count 1, default limit 16); PassThrough forwards highWaterMark and encoding and gaps other options | before: the highWaterMark, objectMode and encoding options gapped; after: 8 new shared cases match on txiki (full parity run) and on Node (631/631) |
| test/parity-cases.js: 8 shared cases (push/write returns, objects reaching _write, hex and utf8 read-side strings); gaps replaced: 'stream.Readable option highWaterMark -1', 'stream.Readable option objectMode', 'stream.PassThrough option objectMode' (the old highWaterMark and Writable objectMode gaps are removed because they are supported now) | the same runs |

Regression: txiki parity with gap assertions: shared 631, mismatches [], unexpectedGaps [], gaps 20, gapInactive 1, 15240 ms. Node parity 631/631 (8411 ms).

Mutation evidence (saved good copy /tmp/stage1-good-txiki.js; each run through mcp-probe with timeout 150 and a gate reading before it; each restore checked with cmp, git status shows the two changed files):

| Mutation | Cases red |
|---|---|
| S1M1: Readable highWaterMark ignored | 1 (push returns [true, true, true, 4]) |
| S1M2: objectMode entry ignored | 1 (write returns all false) |
| S1M3: Writable highWaterMark ignored | 3 (the objectMode held case, highWaterMark 5, PassThrough highWaterMark 2 path) |
| S1M4: PassThrough highWaterMark not forwarded to the write side | 1 (write true, expected false) |
| S1M5: Readable encoding option ignored | 3 (hex on Readable, hex on PassThrough, utf8 multibyte) |

Coverage: seven of the eight new shared cases are red under at least one mutation. 'stream.Writable objectMode passes objects and numbers to _write' is not red under any of the five mutations: its _write receives the same chunks with or without the objectMode branch, so it is a regression witness for the object chunk path, not a mutation witness.

## fx split: fs.createReadStream start, end and highWaterMark, Phase A (2026-11-19)

Rank 7q in docs/fx-split.md. Node probe: runs/analysis/stream-shapes-node.mjs (exit 0, timeout 60): start 2 end 4 of 'abcdefghij' gives 'cde'; start 7 gives 'hij'; end 2 gives 'abc'; highWaterMark 4 gives chunk sizes [4, 4, 2]; start 1, end 8, highWaterMark 3 gives [3, 3, 2]. Invalid shapes (start -1, start 5 end 2) throw in Node and stay gaps in txiki.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: positionOf (safe integer, else gap); createReadStream takes start, end and highWaterMark (0 and negative gap); FileReadStream reads the block size from highWaterMark, skips start bytes by reading and discarding, and stops after end | before: start, end and highWaterMark gapped; after: 5 new shared cases match on txiki (full parity run, 636 shared) and Node (636/636) |
| test/parity-cases.js: 5 shared cases from the Node probe (3 read ranges, 2 chunk sizes) and a helper readStreamLengths; gaps: 'fs.createReadStream start -1', 'fs.createReadStream end before start', 'fs.createReadStream highWaterMark 0', 'fs.createReadStream option highWaterMark -1' | the same runs |

Regression: txiki parity with gap assertions: shared 636, mismatches [], unexpectedGaps [], gaps 24, gapInactive 1. Node parity 636/636.

Mutation evidence (saved good copy /tmp/stage2-good-txiki.js; each run through mcp-probe with timeout 150 and a gate reading before it; restore checked with cmp; git status shows the two changed files):

| Mutation | Cases red |
|---|---|
| S2M1: start ignored | 2 (start and end read gives 'abc'; start alone gives the whole file) |
| S2M2: end ignored | 3 (start and end; end alone; chunk sizes with start, end and highWaterMark) |
| S2M3: block size ignored | 2 (highWaterMark 4 gives [10]; start, end and highWaterMark give [8]) |
| S2M4: skip loop removed | 2 (same as S2M1 for the start cases) |
| S2M5: stream-level highWaterMark not forwarded to the stream | 0: not covered. The stream's own limit is not observable in the suite (there is no getter for it), so no witness is red. Recorded as a gap in the witnesses, not hidden. |

## fx split: writeFile flags rs+, as, as+ and string modes, Phase A (2026-11-19)

Rank 7r in docs/fx-split.md. Node probes: runs/analysis/stream-shapes-node.mjs (rs+ over 'abcdef' with 'XY' gives 'XYcdef'; rs+ on a missing file gives ENOENT; as creates 'add' with mode 644; as on 'base' gives 'baseadd'; as+ on 'base' gives 'baseadd'; string mode '0600' gives mode 600; a string mode on an existing file keeps its mode 644) and runs/analysis/stream-shapes3-node.mjs (as+ creating 'add' gives mode 644). Both exit 0 under timeout 60. tjs.open accepts 'as', 'as+' and 'rs+' (runs/analysis/dev-txiki-shapes-body.js through mcp-probe: as and as+ append; rs+ overwrites from the start, 'XYcdef'); tjs.open has no seek, which is why createReadStream start was done by discarding bytes.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: WRITE_FILE_FLAGS adds 'rs+', 'as' and 'as+'; modeOf accepts a number, or a string of octal digits (parsed as base 8), and gaps any other string | before: rs+, as, as+ and string modes gapped; after: 8 new shared cases match on txiki (full parity run, 644 shared) and Node (644/644) |
| test/parity-cases.js: 8 shared cases (rs+ overwrite and ENOENT; as new and existing; as+ new and existing; string mode 0600 new and on an existing file); the gaps 'fs.promises.writeFile with flag rs+' and 'fs.promises.writeFile with mode 0600' are replaced by 'fs.promises.writeFile with mode zz' | the same runs |

Regression: txiki parity with gap assertions: shared 644, mismatches [], unexpectedGaps [], gaps 23, gapInactive 1, 15216 ms. Node parity 644/644 (8211 ms).

Mutation evidence (saved good copy /tmp/stage3-good-txiki.js; each run through mcp-probe with timeout 150 and a gate reading before it; restore checked with cmp, git status shows the two changed files):

| Mutation | Cases red |
|---|---|
| S3M1: rs+ removed from the whitelist | 2 (rs+ overwrite; rs+ ENOENT) |
| S3M2: as removed from the whitelist | 2 (as new; as existing) |
| S3M3: as+ removed from the whitelist | 2 (as+ existing; as+ new) |
| S3M4: string modes gapped | 2 (string mode new; string mode on an existing file) |
| S3M5: string modes parsed as decimal | 1 (string mode new, threw EACCES). The existing-file case stays green, because a file that exists keeps its mode, so the parse is not reached on it. |

Coverage: every new shared case is red under at least one mutation.

## Phase B: stream options, createReadStream options and writeFile flags (1fe4448d), 2026-11-19

Gate: `vmstat 1 2`; the first line is the average since boot, the second line is a one-second sample and is the gate reading (si, so in KB/s). `ps` checked for build jobs (zig, cargo, rustc, clang, gcc, ninja, make, tsc). Every reading, in order:

| # | Before | Since-boot (si, so) | Gate sample (si, so) | Heavy job | Open |
|---|---|---|---|---|---|
| 1 | start | 7085, 10499 | 24, 0 | none | yes |
| 2 | node-parity | 7085, 10499 | 4556, 0 | none | no |
| 3 | node-parity retry | 7080, 10492 | 52, 0 | none | yes: node parity ran |
| 4 | txiki-parity | 7077, 10488 | 12, 0 | zig build by another peer (maker build; zig-toolchain 0.17.0) | no |
| 5 | txiki-parity retry | 7072, 10480 | 0, 0 | zig build by another peer | no |
| 6 | txiki-parity retry | 7068, 10472 | 1052, 0 | zig build by another peer | no |
| 7 | txiki-parity retry | 7063, 10463 | 56, 0 | none | yes: txiki parity ran |
| 8 | node-contract | 7059, 10457 | 28, 268 | none | yes: node contract ran |
| 9 | txiki-contract | 7058, 10456 | 44, 0 | none | yes: txiki contract ran |

The zig build in readings 4 to 6 belongs to another peer and was not touched. No witness started on a closed reading.

| Witness | Command | Result | Wall time |
|---|---|---|---|
| Node parity | cd packages/util/runtime && node test/parity-node.js (timeout 150) | node: 644/644 shared cases match; 0/0 gaps throw the documented message; 8151 ms | 8.29 s |
| txiki parity with gap assertions | mcp-probe runs/analysis/parity-txiki-body.js (timeout 150) | label txiki, shared 644, gapAsserted 0, gaps 23, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 15055 | 15.22 s |
| Node contract | node test/contract-node.js (timeout 150) | node: 117 names present across 25 subpaths | 0.08 s |
| txiki contract | mcp-probe runs/analysis/contract-txiki-body.js (timeout 150) | present 117, missing [] | 0.16 s |

Probes in this stretch: each Node probe and each txiki run (mcp-probe) was bounded by timeout (60 s for the Node shape probes, 120 s for the txiki shape and flood probes, 150 s for the mutation and witness runs). Each ended by itself with exit 0, and none was restarted under a new PID. The mutation loops in Phase A were stopped by their own bounds (no run was killed by PID). A final `ps` check found no leftover mcp-probe, parity or contract process of mine.

Longest step: the stage 3 mutation loop, dominated by gate waits (the loop sampled up to 25 times, 20 s apart, before each run). It was not timed separately. What was done about it: each run waited for an open reading and was bounded by timeout 150, and the job was polled rather than restarted.

Not verified: the witnesses ran once each. The Node contract and txiki contract do not exercise the new options directly; the parity cases do.

## Phase A: stream-level buffered limit of fs.createReadStream (witness for S2M5 and S2M2), 2026-11-19

Gap from the previous report: the stream-level limit was red under no witness, because the suite only observed emitted data. This adds witnesses that read the stream's own buffer (readableLength) after one read(0) and a 150 ms wait. Node first: runs/analysis/stream-limits-node.mjs (exit 0, timeout 60). Its first version, without read(0), gave 0 for every case: Node does not read until asked, so the witness calls read(0). With read(0), Node gives: highWaterMark 4 gives 4; start 2 end 4 gives 3; end 2 alone gives 3; start 1, end 8, highWaterMark 3 gives 3; no options gives 10 (the whole small file).

| Change | Phase A evidence |
|---|---|
| test/parity-cases.js: 5 witnesses (readableLength after read(0) and 150 ms) for the highWaterMark limit, the start and end limit, the end-alone limit, the start/end/highWaterMark limit, and a control with no options | Node parity 649/649 (8979 ms); txiki parity with gap assertions: shared 649, gaps 23, mismatches [] (the source is the committed stage-3 source, unchanged) |

Mutation evidence (saved good copy /tmp/stageA-good-txiki.js; each run through mcp-probe with timeout 150 and an open window before it; restore checked with cmp; git status shows no change to txiki.js):

| Mutation | Stream-level witnesses red |
|---|---|
| A-M1 (= S2M5): the stream-level highWaterMark not forwarded to the stream | 2: 'highWaterMark 4 limits the buffered bytes to 4' (got 10, expected 4) and 'start, end and highWaterMark limit the buffered bytes' (got 8, expected 3) |
| A-M2 (= S2M2): the end limit ignored | 2: 'start and end limit the buffered bytes to the range' (got 8, expected 3) and 'end alone limits the buffered bytes' (got 10, expected 3); the data-level end cases are red as well |

S2M5 is now covered (it was red under no witness before). The object-path mutation for the stage-1 case is recorded in its own section below.

## Phase A: object path witness (stage-1 case 'stream.Writable objectMode passes objects and numbers to _write'), 2026-11-19

Gap from the previous report: the case was red under no mutation. A new mutation breaks the object path in Writable's objectMode entry (the chunk is turned into a Buffer of its string form before it reaches _write), and the case turns red. Restored with cmp (identical to the committed source) and git status (clean).

| Mutation | Red case and evidence |
|---|---|
| S1M6: objectMode entry converts the chunk: `chunk: Buffer.from(String(chunk))` | 1 red: 'stream.Writable objectMode passes objects and numbers to _write' (got 'object:{"type":"Buffer","data":[91,111,98,106,101,99,116,32,79,98,106,101,99,116,93]}' for the object, expected 'object:{"a":1}'). Run through mcp-probe with timeout 150, exit 0, gate open before it. Only this case is red. |

The earlier note (the case is a regression witness only) is superseded: it is now red under S1M6.

## fx split: objectMode on Readable and PassThrough, Phase A (2026-11-20)

Rank 7s in docs/fx-split.md. Node probe: runs/analysis/stream-objectmode-node.mjs (exit 0, timeout 60). Node values used as expected: 17 pushes to an objectMode Readable return fifteen trues then two falses, length 17; data events emit object, number and string in order; read(5) returns one object, the next read returns the number, the third read returns null with length 0; read on an empty stream returns null; a Buffer pushed in objectMode stays one object (typeof object, length 2); a PassThrough objectMode round-trips an object and a number with write true for both; with highWaterMark 2 the pushes return true, false, false and length 3. Not used: the PassThrough with highWaterMark 2 in objectMode (Node returns true, true, false because the unread readable side holds back its writable side; txiki's PassThrough calls its transform callback at once, so the expected value would not match; gapped in the notes).

| Change | Phase A evidence |
|---|---|
| src/txiki.js: Readable takes objectMode (one count per object; push adds the object as it is; #howMuchToRead and #fromList return one object; default limit 16; unshift and encoding with objectMode gap); PassThrough forwards objectMode to both sides | before: objectMode on Readable and PassThrough gapped; after: 7 new shared cases match on txiki (full run, 656 shared, gaps 23, mismatches [], elapsedMs 15912) and Node (656/656, 8897 ms) |
| test/parity-cases.js: 7 shared cases (push returns with 16-object limit; data events; read one per call; read on empty; Buffer as one object; PassThrough round trip; highWaterMark 2 push returns); gaps: 'stream.Readable encoding with objectMode', 'stream.Readable unshift with objectMode' (the two Readable and PassThrough objectMode gaps are removed) | the same runs |

Mutation evidence (saved good copy /tmp/stageB-good-txiki.js; each run through mcp-probe with timeout 150 and an open window before it; restore checked with cmp each time; git status shows the two changed files):

| Mutation | Result |
|---|---|
| B-OM1: push bypasses the object path (object converted to a Buffer) | 3 red: 'data events emit objects, numbers and strings', 'read returns one object per call', 'PassThrough round trips objects and numbers' |
| B-OM2: the object branch of #fromList removed | no result: the run hung until its timeout (exit 124 at 150 s); the body never returned. Not counted as a red case. |
| B-OM3: the object branch of #howMuchToRead removed | no result: the gm worker restarted during the run, both times (the body was killed with reason restart); not counted as a red case. |
| B-OM4: the default limit of 16 for objectMode ignored | 1 red: 'push returns follow a 16-object limit' |
| B-OM5: objects counted in bytes (length += bytes.length) | no result: the run hung until its timeout (exit 124 at 150 s). Not counted as a red case. |
| B-OM6: PassThrough does not forward objectMode to the read side | 1 red: 'PassThrough round trips objects and numbers' |
| B-OM7: the objectMode highWaterMark option ignored | 1 red: 'highWaterMark 2 push returns' (got [true, true, true, 3]) |

Coverage: five of the seven new shared cases are red under a clean mutation (push returns, data events, read one per call, PassThrough round trip, highWaterMark 2). 'read on an empty stream returns null' and 'keeps a Buffer as one object' are regression witnesses only: no clean mutation of theirs was found.

## fx split: highWaterMark errors as ERR_INVALID_ARG_VALUE, Phase A (2026-11-20)

Rank 7t in docs/fx-split.md (item 3 of the ranked list). Node probe: runs/analysis/stream-hwm-errors-node.mjs (exit 0, timeout 60). Node: -1, the string '4', 1.5 and NaN each throw ERR_INVALID_ARG_VALUE with "The property 'options.highWaterMark' is invalid. Received <value>" (a string is shown in single quotes); the same for a Writable, a Readable with objectMode and -2, and fs.createReadStream with -1 and 2.5; a PassThrough names 'options.readableHighWaterMark'; highWaterMark 0 is accepted.

| Change | Phase A evidence |
|---|---|
| src/txiki.js: invalidArgValue (ERR_INVALID_ARG_VALUE with Node's message) and highWaterMarkOf (negative, non-integer or string gives the error; the property name is passed in); PassThrough validates its readable side first (before super), so the message names options.readableHighWaterMark | before: the same inputs gapped; after: 9 new shared cases match on txiki (full run, 665 shared, gaps 21, mismatches [], elapsedMs not recorded) and Node (665/665, 9022 ms) |
| test/parity-cases.js: 9 shared cases (code and message for Readable -1, Readable '4', Readable 1.5, objectMode -2, Writable -1, PassThrough -1, createReadStream -1 and 2.5; highWaterMark 0 accepted); the gaps 'stream.Readable option highWaterMark -1' and 'fs.createReadStream option highWaterMark -1' are removed | the same runs |

Mutation evidence (saved good copy /tmp/stageC-good-txiki.js, which is the edited file; each run through mcp-probe with timeout 150 and an open window before it; restore checked with cmp; git status shows the two changed files):

| Mutation | Red cases |
|---|---|
| C-H1: the error replaced by a gap | 8 (every error case) |
| C-H2: negative accepted | 5 (Readable -1, objectMode -2, Writable -1, PassThrough -1, createReadStream -1) |
| C-H3: non-integer accepted | 2 (Readable 1.5, createReadStream 2.5) |
| C-H4: PassThrough names options.highWaterMark instead of the readable side | 1 (PassThrough -1) |

Coverage: every error case is red under at least one mutation (the string '4' case under C-H1 only). The zero case is a control and is not red under any mutation.

## Phase B: stream-level limit, object path, objectMode and highWaterMark errors (7ec83244, after 724554a5), 2026-11-20

Window: one bounded window, one reading every 30 seconds, from the first reading (slot0) to the last witness (slot8), 314 s. Each reading: `vmstat 1 2`, second sample = gate (si, so in KB/s); heavy-job check: `top -bn2 -d1`, second frame, current %CPU, any process at 25% or more that is not a gm-core started with `--handshake`. Each witness started only on a clear reading.

| Slot | Since-boot (si, so) | Gate sample (si, so) | Heavy jobs (current %CPU) | Clear |
|---|---|---|---|---|
| 0 | 6370, 9386 | 7796, 0 | 12 rustc processes at 86–91% (another peer) | no |
| 1 | 6387, 9377 | 676, 0 | none | yes: Node parity started |
| 2 | 6381, 9364 | 512, 0 | none | yes: txiki parity started |
| 3 | 6377, 9370 | 2556, 75608 | chromium at 205% and 177% (another peer) | no |
| 4 | 6390, 9382 | 3184, 0 | none (gate closed) | no |
| 5 | 6391, 9373 | 2608, 0 | none (gate closed) | no |
| 6 | 6389, 9363 | 132, 0 | none | yes: Node contract started |
| 7 | 6399, 9353 | 7784, 0 | none (gate closed) | no |
| 8 | 6396, 9345 | 148, 8 | none | yes: txiki contract started |

| Witness | Start slot | Command | Result | Wall time |
|---|---|---|---|---|
| Node parity | 1 | cd packages/util/runtime && node test/parity-node.js (timeout 150, PID 1392938, exit 0) | node: 665/665 shared cases match; 0/0 gaps throw the documented message; 8854 ms | 9.23 s |
| txiki parity with gap assertions | 2 | mcp-probe runs/analysis/parity-txiki-body.js (timeout 150, PID 1393561, exit 0) | label txiki, shared 665, gapAsserted 0, gaps 21, gapInactive 1, mismatches [], unexpectedGaps [], elapsedMs 13654 | 13.84 s |
| Node contract | 6 | node test/contract-node.js (timeout 150, PID 1396365, exit 0) | node: 117 names present across 25 subpaths | 0.11 s |
| txiki contract | 8 | mcp-probe runs/analysis/contract-txiki-body.js (timeout 150, PID 1396698, exit 0) | present 117, missing [] | 0.18 s |

Probes: each probe ran under timeout 150, was started by its PID (captured with `$!`) and was waited on to its end; each exited by itself with exit 0 after 0.11 s to 13.84 s. None was stopped by PID because none hung. None was restarted under a new PID. A final `ps` check found no mcp-probe, parity or contract process of mine.

Longest step: the window waiting for the gate (slots 0, 3, 4, 5 and 7 were closed, by other peers' rustc, chromium and loads). What was done about it: readings every 30 s, witnesses started only on clear readings, every probe bounded at 150 s.

Not verified: the four witnesses ran once each.

## fx split: createReadStream signal option (7u), Phase A (2026-11-20)

Oracle: runs/analysis/createreadstream-options-node.mjs (timeout 60, PID 1491617, exit 0; output runs/analysis/createreadstream-options-node.out). Node 24.22.0 values:
- signal already aborted: error ABORT_ERR (AbortError), then close, no data.
- signal aborted inside the first data handler (highWaterMark 4): data 'abcd', error ABORT_ERR (AbortError), close.
- non-AbortSignal signal: ERR_INVALID_ARG_TYPE thrown synchronously ("The \"options.signal\" property must be an instance of AbortSignal").
- flags 'r' and 'r+' read the file; flags 'w' gives EBADF on the read stream and truncates the file; flags 'wx' on an existing file gives EEXIST; mode 0o600 on an existing file leaves its mode at 644; autoClose false gives (data and end, no close: corrected, fd still open, see 7x).

Change (Phase A): src/txiki.js FileReadStream #watchAbort (already aborted → nextTick destroy with abortError; otherwise an abort listener); createReadStream accepts the signal option and throws gapError for a non-AbortSignal value; the other options (flags as a non-read value, mode, autoClose) stay gapped, as before. test/parity-cases.js: shared cases 'fs.createReadStream signal already aborted emits AbortError then close' (expected ['error ABORT_ERR AbortError', 'close']) and 'fs.createReadStream signal aborted during a read stops after the chunk in flight' (expected ['data abcd', 'error ABORT_ERR AbortError', 'close']).

Pending (Phase B window): Node parity run, txiki parity run, and the red mutations (see the Phase B section that follows the window).

## Phase B: createReadStream signal option (3ffe4105), 2026-11-20

Window: one bounded window, 344 s, one reading every 30 s (slot 0 to slot 9). Each reading is `vmstat 1 2` (second sample = gate, si and so in KB/s) plus `top -bn2 -d1` (second frame, current %CPU or RES 1 GB or more; gm-core started with `--handshake` excluded by its full command line). Each witness started only on a clear reading.

| Slot | Gate (si, so) | Heavy jobs | Clear |
|---|---|---|---|
| 0 | 32, 0 | chromium renderer 3.4g RES at 222.8%, chromium gpu-process at 213.9% (another peer) | no |
| 1 | 1152, 0 | none | no (si over 1000) |
| 2 | 180, 0 | none | yes: Node parity started |
| 3 | 5128, 0 | chromium renderer 49.5%, chromium 45.5% and 27.7% (another peer) | no |
| 4 | 412, 0 | none | yes: txiki parity started |
| 5 | 13588, 0 | none | no (si over 1000) |
| 6 | 140, 0 | none | yes: S-A1 started |
| 7 | 196, 0 | none | yes: S-A2 started |
| 8 | 356, 0 | none | yes: Node contract started |
| 9 | 52, 0 | none | yes: txiki contract started |

Witnesses (each run once, each probe under timeout 150 and started by its PID):

| Witness | Slot | Result | Wall time |
|---|---|---|---|
| Node parity (PID 1492594, exit 0) | 2 | node: 667/667 shared cases match; 0/0 gaps throw the documented message; 8894 ms | 8.98 s |
| txiki parity, good source (PID 1493206, exit 0) | 4 | shared 667, gaps 21, mismatches [] | 13.86 s |
| S-A1: the watch is not installed (PID 1495580, exit 0) | 6 | red: 'signal already aborted' got ['data abcdefghij','close'] (expected ['error ABORT_ERR AbortError','close']); 'signal aborted during a read' mismatches too (got data abcdefghij events, expected ['data abcd','error ABORT_ERR AbortError','close']). Restored: RESTORED_IDENTICAL | 13.98 s |
| S-A2: the already-aborted branch returns without an error (PID 1497681, exit 0) | 7 | red on 'signal already aborted' only (got ['data abcdefghij','close']); 'signal aborted during a read' stays green. Restored: RESTORED_IDENTICAL | 13.87 s |
| Node contract (PID 1499935, exit 0) | 8 | node: 117 names present across 25 subpaths | 0.12 s |
| txiki contract (PID 1500313, exit 0) | 9 | present 117, missing [] | 0.22 s |

Restore: /tmp/stageD-good-txiki.js is the source before the mutations; after the mutations, `cmp` gave identical files and `git status --short` was empty. The output of `ps` showed no process of mine left.

Longest step: the txiki parity run and the two mutation runs (about 14 s each). The longest wait was the gate closed at slots 0, 1, 3 and 5 (other peers' chromium, si 1000 or more). What was done about it: sampled every 30 s, started each witness only on a clear reading, and bounded each probe at 150 s.

Not covered in this window: the other options that the Node oracle records (flags r+, w, wx; mode; autoClose: false; a non-AbortSignal signal). They stay as gaps, with the one-line reopen evidence in 7u.

## fx split: createReadStream flags r, r+, w, wx (7v), Phase A (2026-11-20)

Oracle recheck: runs/analysis/createreadstream-options-node.mjs ran again on a clear sample (slot 4, si 8, so 0; PID 1507144, exit 0). Node 24.22.0 values unchanged: flags r → 'abcdefghij'; flags r+ → 'abcdefghij'; flags w → error EBADF (name Error), close, copy file left as '' (truncated); flags wx on an existing file → error EEXIST (name Error), close.

Change (Phase A): src/txiki.js: createReadStream accepts flags in READ_STREAM_FLAGS (r, r+, w, wx; anything else gapError), passes it to FileReadStream, which opens the file with that flag instead of always 'r'. test/parity-cases.js: shared cases 'fs.createReadStream flags r reads the file', 'flags r+ reads the file', 'flags w fails with EBADF and truncates the file', 'flags wx on an existing file fails with EEXIST and keeps it' (each records the events plus the file text after close; the w case runs on its own temp copy from streamFile).

Pending (Phase B window): the Node and txiki parity runs, and the red checks F-M1 (open always 'r') and F-M2 (wx opened as w).

## Phase B: createReadStream flags r, r+, w, wx (945e3b8d), 2026-11-20

Window: one bounded window, 700 s, 21 samples at 30 s (`vmstat 1 2`, second sample = gate; `top -bn2 -d1` second frame with %CPU 20 or more or RES 1 GB or more, gm-core with `--handshake` excluded by full command line). Samples that were clear: slots 0, 1, 2, 14 and 20. The other 16 samples were closed (zig builds and tests of another peer, a claude session at 20 to 35% CPU, si up to 31764 KB/s) and no probe was started on them; they have no ledger line.

Witnesses run once, each probe under timeout 150, started by PID (`$!`), waited to its end:

| Witness | Slot | Result | Wall time |
|---|---|---|---|
| Node parity (PID 1508328, exit 0) | 0 | node: 671/671 shared cases match; 0/0 gaps throw the documented message; 9206 ms | 9.65 s |
| txiki parity, committed source (PID 1508817, exit 0) | 1 | shared 671, gaps 21, gapInactive 1, mismatches [], unexpectedGaps [] | 14.05 s |
| F-M1: open always 'r' (PID 1510844, exit 0) | 2 | red: 'createReadStream flags w fails with EBADF and truncates the file' and 'createReadStream flags wx on an existing file fails with EEXIST and keeps it'; r and r+ stay green. Restored: RESTORED_IDENTICAL | 13.89 s |
| F-M2: wx opened as w (PID 1519002, exit 0) | 14 | red: 'createReadStream flags wx on an existing file fails with EEXIST and keeps it' only; w stays green. Restored: RESTORED_IDENTICAL | 13.86 s |
| Node contract (PID 1525095, exit 0) | 20 | node: 117 names present across 25 subpaths | 0.13 s |
| txiki contract | not run | the window ended at 21 samples before a clear sample after the node contract (slot 20 was the last) | not run |

Restore: /tmp/stageG-good-txiki.js is the committed source; after the mutations `cmp` gave identical files and `git status --short` was empty. No process of mine was left running (ps shows none).

Not done here: the txiki contract witness (see above). The Node oracle recheck (before the witnesses were written) ran on a clear sample at slot 4 of the earlier job, PID 1507144, exit 0, with the same values as before.

Longest step: the txiki parity run (14.05 s). The longest wait was the closed gate (16 of 21 samples).

## Phase B completion: txiki contract for the createReadStream flags (4723570c), 2026-11-20

The txiki contract, which was not run in the window recorded above, ran in its own window: 8 samples at 30 s (slots 0 to 7). Samples 0 to 6 were closed (a chromium renderer at 169% with 3.9 GB RES and an fx build of another peer; si up to 72240 KB/s; a claude session at 31.7%); no probe started on them and they have no ledger line. The clear reading was slot 7: `vmstat 1 2` second sample si 104, so 0; no process above 20% CPU in top and no process above 1 GB RES, after excluding gm-core workers started with `--handshake`.

Witness (once, under timeout 150, PID captured with `$!`, exit 0 by itself):

| Witness | Slot | Result | Wall time |
|---|---|---|---|
| txiki contract (PID 1603330, exit 0) | 7 | present 117, missing [] | 0.18 s |

No process of mine was left after the run (ps shows none). No source was changed in this stretch, so no restore was needed.

## fx split: createReadStream mode (7w), Phase A (2026-11-20)

Node recheck on a clear sample (slot 7 of its job; PID 1609748, exit 0; output runs/analysis/createreadstream-mode-autoclose-node.out): a file written at 644 read with mode 0o600 stays 644; a file at 640 read with mode 0o777 stays 640. mode has no effect on an existing file.

Change (Phase A): src/txiki.js accepts 'mode' in createReadStream (no effect). test/parity-cases.js: shared case 'fs.createReadStream mode 0o600 leaves an existing file unchanged' (the events plus whether the mode before and after the read is the same; expected ['data abcdefghij', 'close', 'mode unchanged']). The check compares before and after, not a fixed 644, because the umask of the host decides the creation mode.

Pending (Phase B window): the Node and txiki parity runs, and the red check MO-1 (mode removed from the accepted options, so the read throws the gap).

Correction to the earlier records (the flags and signal sections above and fx-split 7u/7v): the autoClose: false result in the earlier options probe does not reproduce in the variant probe (runs/analysis/createreadstream-autoclose-variants-node.out). See the autoClose section.

## fx split: createReadStream autoClose false (7x), Phase A (2026-11-20)

Node oracle, rechecked on a clear sample (slot 0 of its job; PID 1610476, exit 0; output runs/analysis/createreadstream-autoclose-variants-node.out): with autoClose false the stream emits open, ready, data, end and no close, both with the old listeners (data, end, close listeners only) and with the new ones; 150 ms, 200 ms and 1000 ms waits all give no close; closed is false after end. A missing file gives error ENOENT and no close (runs/analysis/createreadstream-mode-autoclose-node.out, PID 1609748).

Discrepancy, not resolved: the earlier options probe (runs/analysis/createreadstream-options-node.mjs) still prints data, end, close for autoClose false when rerun on a clear sample (PID 1610351, exit 0). The variant probe with the same listener set does not. The cause is not known; it is recorded here and not hidden. The witnesses follow the variant probe (no close), and the Node parity run will show if the two disagree in the harness.

Change (Phase A): src/txiki.js: FileReadStream takes the option; _afterEnd is skipped when it is false; an open error is emitted without a destroy when it is false; createReadStream accepts a boolean (other values gapped). test/parity-cases.js: collectFor (events for a fixed time, then destroy) and two shared cases: 'autoClose false reads the data and never emits close' (expected ['data abcdefghij', 'end']) and 'autoClose false on a missing file emits ENOENT and no close' (expected ['error ENOENT Error']).

Pending (Phase B window): the Node and txiki parity runs, and the red checks AC-1 (autoClose removed from the accepted options: both cases red), AC-2 (open-error destroy kept: the missing-file case red), AC-3 (_afterEnd not gated: the data case red), and MO-1 (mode removed from the accepted options: the mode case red).

## Phase B (partial window): createReadStream mode and autoClose (71d39db8, c0607f04), 2026-11-20

One bounded window, 687 s, 21 samples at 30 s (`vmstat 1 2`, second sample = gate; `top -bn2 -d1` second frame, %CPU 20 or more or RES 1 GB or more; gm-core with `--handshake` excluded by full command line). Clear samples: slots 7, 8 and 9 only. The other 18 were closed (zig builds and tests of another peer; chromium gpu-process at 400 to 937% CPU; fx builds; claude sessions at 20 to 54%; si up to 3524 KB/s). No probe started on a closed sample, and closed samples have no ledger line.

| Witness | Slot | Result | Wall time |
|---|---|---|---|
| Node parity (PID 1615603, exit 0) | 7 | node: 674/674 shared cases match; 0/0 gaps throw the documented message; 9473 ms | 9.56 s |
| txiki parity, committed source (PID 1616505, exit 0) | 8 | shared 674, gaps 21, mismatches [] (so both autoClose cases and the mode case pass on txiki) | 14.45 s |
| MO-1: mode removed from the accepted options (PID 1622044, exit 0) | 9 | red: 'fs.createReadStream mode 0o600 leaves an existing file unchanged' threw 'txiki.js has no fs.createReadStream option mode'. Restored: RESTORED_IDENTICAL | 14.84 s |

Not run in this window (the window ended with no clear sample after slot 9): AC-1 (autoClose removed from the accepted options), AC-2 (open-error destroy kept), AC-3 (end path ungated), the Node contract and the txiki contract. They are still to run; no push has been made, because the push waits on every listed witness.

Restore: /tmp/stageI-good-txiki.js is the committed source; after MO-1, `cmp` gave identical files and `git status --short` was empty. No process of mine was left running.

Longest step: the txiki parity run (14.45 s). The longest wait was the closed gate (18 of 21 samples).

## autoClose oracle: the cause of the close in the options probe (Phase A, 2026-11-20)

Cause: runs/analysis/createreadstream-options-node.mjs set out.autoCloseFalse = ev4, the live array, and then called tmp.destroy() and waited 50 ms before printing. The destroy emits close into that same array, so the printed result showed data, end, close. Node was not closing on its own: the variant probe (runs/analysis/createreadstream-autoclose-variants-node.mjs) copies the array before destroy and shows data and end with no close, with and without the new listeners, at 150, 200 and 1000 ms.

Fix: out.autoCloseFalse = [...ev4] before the destroy. The buggy output is kept as runs/analysis/createreadstream-options-node.buggy-snapshot.out. The fixed probe runs once in the Phase B window below; the result is recorded there.

Correction in the docs: fx-split 7u and 7v, and the flags Phase B note, now say autoClose: false gives data and end with no close and the fd still open (the variant probe is the source).

## Phase B: autoClose red checks and contracts, and the options-probe cause (18961772), 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (its working copy matches the commit), exit 0 means clear. Gate: `vmstat 1 2` second sample, both si and so under 1000 KB/s. A witness started only on a sample where both held.

The window ran 35 samples over 1145 s (slots 0 to 34). The first ten-minute span (slots 0 to 20, 678 s) cleared on slots 0, 2 and 4. The rest ran on slots 26, 33 and 34 (minute 872 to 1145, about 4.5 min, within the one more ten-minute window allowed). The other samples were closed by other peers' zig builds and tests, a cmake and ninja gm-tool build, node q-greek-sweep and q-greek-gnu jobs, chromium at 20 to 38%, and si up to 24908 KB/s. No probe started on a closed sample; closed samples have no ledger line.

| Witness | Slot | Result | Wall time |
|---|---|---|---|
| Options probe, fixed (snapshot before destroy) | 0 | autoCloseFalse: ["data", "end"]; the earlier close was the probe's own live-array aliasing (see the cause section above) | 0.45 s |
| AC-1: autoClose removed from the accepted options (PID 1718600, exit 0) | 2 | red on 'fs.createReadStream autoClose false reads the data and never emits close' and 'fs.createReadStream autoClose false on a missing file emits ENOENT and no close' (both threw the gap). Restored: RESTORED_IDENTICAL | 14.05 s |
| AC-2: open-error destroy kept (PID 1720691, exit 0) | 4 | red on 'fs.createReadStream autoClose false on a missing file emits ENOENT and no close' only. Restored: RESTORED_IDENTICAL | 14.45 s |
| AC-3: end path ungated (PID 1832780, exit 0) | 26 | red on 'fs.createReadStream autoClose false reads the data and never emits close' only. Restored: RESTORED_IDENTICAL | 14.43 s |
| Node contract (PID 1886974, exit 0) | 33 | node: 117 names present across 25 subpaths | 0.16 s |
| txiki contract (PID 1887239, exit 0) | 34 | present 117, missing [] | 0.17 s |

The source was not changed in this stretch; the good copy is the committed c0607f04 version. The Node and txiki parity runs on this source passed in the previous window (674/674 and shared 674, mismatches []).

Restore: after the mutations, `cmp` gave identical files and `git status` was empty. No process of mine was left running.

Longest step: the txiki parity-style mutation runs (about 14.5 s each). The longest wait was the closed gate (31 of 35 samples closed in total, across both spans).

## fx split: createReadStream flag rs (7y), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): sync read: the same bytes as r.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'rs'. test/parity-cases.js: shared case 'fs.createReadStream flags rs reads or fails as Node does' (expected ["data abcdefghij","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-rs: 'rs' removed from the accepted list.

## fx split: createReadStream flag rs+ (7z), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): sync read and write: the same bytes as r+.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'rs+'. test/parity-cases.js: shared case 'fs.createReadStream flags rs+ reads or fails as Node does' (expected ["data abcdefghij","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-rs+: 'rs+' removed from the accepted list.

## fx split: createReadStream flag w+ (7aa), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): read and write, truncates the file: reads nothing and leaves the file empty.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'w+'. test/parity-cases.js: shared case 'fs.createReadStream flags w+ reads or fails as Node does' (expected ["close","file \"\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-w+: 'w+' removed from the accepted list.

## fx split: createReadStream flag wx+ (7ab), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): read and write, exclusive create: EEXIST on an existing file, the file is kept.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'wx+'. test/parity-cases.js: shared case 'fs.createReadStream flags wx+ reads or fails as Node does' (expected ["error EEXIST Error","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-wx+: 'wx+' removed from the accepted list.

## fx split: createReadStream flag a (7ac), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): append, write only: EBADF on read, the file is kept.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'a'. test/parity-cases.js: shared case 'fs.createReadStream flags a reads or fails as Node does' (expected ["error EBADF Error","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-a: 'a' removed from the accepted list.

## fx split: createReadStream flag ax (7ad), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): append, exclusive: EEXIST on an existing file, the file is kept.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'ax'. test/parity-cases.js: shared case 'fs.createReadStream flags ax reads or fails as Node does' (expected ["error EEXIST Error","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-ax: 'ax' removed from the accepted list.

## fx split: createReadStream flag a+ (7ae), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): append and read: reads the file and keeps it.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'a+'. test/parity-cases.js: shared case 'fs.createReadStream flags a+ reads or fails as Node does' (expected ["data abcdefghij","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-a+: 'a+' removed from the accepted list.

## fx split: createReadStream flag ax+ (7af), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): append, read and exclusive: EEXIST on an existing file, the file is kept.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'ax+'. test/parity-cases.js: shared case 'fs.createReadStream flags ax+ reads or fails as Node does' (expected ["error EEXIST Error","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-ax+: 'ax+' removed from the accepted list.

## fx split: createReadStream flag as (7ag), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): sync append, write only: EBADF on read, the file is kept.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'as'. test/parity-cases.js: shared case 'fs.createReadStream flags as reads or fails as Node does' (expected ["error EBADF Error","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-as: 'as' removed from the accepted list.

## fx split: createReadStream flag as+ (7ah), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): sync append and read: reads the file and keeps it.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open takes the flag, so only the accepted list changes.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'as+'. test/parity-cases.js: shared case 'fs.createReadStream flags as+ reads or fails as Node does' (expected ["data abcdefghij","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-as+: 'as+' removed from the accepted list.

## fx split: createReadStream flag zz (7ai), Phase A (2026-11-20)

Node oracle: runs/analysis/createreadstream-flags-node.out (clear sample, PID 1893227, exit 0): an invalid flag: Node emits an error event with code ERR_INVALID_ARG_VALUE (TypeError) asynchronously, then close; txiki threw a gap synchronously before this change.
txiki probe: runs/analysis/tjs-flags.out (tjs.open on copies, clear sample, PID 1894026, exit 0). tjs.open accepts zz silently, so the check is in the stream, and the invalid flag path now returns an error stream (ERR_INVALID_ARG_VALUE, TypeError, emitted with nextTick), not a sync gap.

Change: src/txiki.js: READ_STREAM_FLAGS includes 'zz'. test/parity-cases.js: shared case 'fs.createReadStream flags zz reads or fails as Node does' (expected ["error ERR_INVALID_ARG_VALUE TypeError","close","file \"abcdefghij\""]).

Pending (Phase B window): the Node and txiki parity runs, and the red check RC-zz: 'zz' removed from the accepted list (the invalid path throws a gap instead).

## Phase B (partial, two spans, 1368 s): createReadStream flags rs, rs+, w+, wx+, a, ax, a+, ax+, as, as+, zz, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s.

The two spans together gave 42 samples (slots 0 to 41). Clear samples were slots 0, 2 and 4 only. Closed samples (39) were chromium's gpu-process at 100 to 930% CPU for most of the window (other peers' session), zig compiles and tests, grep and node jobs, and si up to 40588 KB/s. No probe started on a closed sample, and closed samples have no ledger line.

| Witness | Slot | Result | Wall time |
|---|---|---|---|
| Node parity (PID 1894781, exit 0) | 0 | node: 685/685 shared cases match; 0/0 gaps throw the documented message; 9856 ms | 9.99 s |
| txiki parity, final source (PID 1895617, exit 0) | 2 | shared 685, gaps 21, mismatches [], unexpectedGaps [] | 14.77 s |
| RC-rs: 'rs' removed from the accepted list (PID 1898375, exit 0) | 4 | red on 'fs.createReadStream flags rs reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.49 s |

Not run (the spans ended with no clear sample after slot 4): RC-rs+, RC-w+, RC-wx+, RC-a, RC-ax, RC-a+, RC-ax+, RC-as, RC-as+, RC-zz (zz restored to a sync gap throw), the Node contract and the txiki contract. No push: the push waits for every listed witness to run and pass.

Restore: /tmp/stageJ-good-txiki.js is the final committed source (7d99242a); after RC-rs, `cmp` gave identical files and `git status --short` was empty. No process of mine was left running.

Longest step: the txiki parity run (14.8 s). The longest wait was the closed gate (39 of 42 samples).

## Phase B (rest, one window, 737 s): red checks for the createReadStream flags, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. 21 samples at 30 s (slots 0 to 20). Clear samples: slots 2, 3, 8, 12, 19 and 20 (six). The other 15 were closed: zig test and compile jobs of another peer, a chromium test process at 100%, claude sessions at 20 to 22%, and si up to 28820 KB/s. No probe started on a closed sample, and closed samples have no ledger line.

| Step | Slot | Result | Wall time |
|---|---|---|---|
| RC-rs+: 'rs+' removed from the accepted list (PID 1925864, exit 0) | 2 | red on 'fs.createReadStream flags rs+ reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.66 s |
| RC-w+: 'w+' removed (PID 1928366, exit 0) | 3 | red on 'fs.createReadStream flags w+ reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.48 s |
| RC-wx+: 'wx+' removed (PID 1932530, exit 0) | 8 | red on 'fs.createReadStream flags wx+ reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 15.16 s |
| RC-a: 'a' removed (PID 1936217, exit 0) | 12 | red on 'fs.createReadStream flags a reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.49 s |
| RC-ax: 'ax' removed (PID 1943907, exit 0) | 19 | red on 'fs.createReadStream flags ax reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.55 s |
| RC-a+: 'a+' removed (PID 1947697, exit 0) | 20 | red on 'fs.createReadStream flags a+ reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.43 s |

Not run in this window: RC-ax+, RC-as, RC-as+, RC-zz (the sync gap restored in place of the error stream), the Node contract and the txiki contract. No push: the push waits for every listed witness to run and pass.

Restore: /tmp/stageJ-good-txiki.js is the final committed source (7d99242a); each restore gave identical files, and the final `cmp` gave FINAL_IDENTICAL. `git status --short` was empty. No process of mine was left running.

Longest step: the txiki parity-style mutation runs (about 14.5 s each). The longest wait was the closed gate (15 of 21 samples).

## Phase B (final, one window, 546 s): red checks RC-ax+, RC-as, RC-as+, RC-zz and the contracts, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. 16 samples at 30 s (slots 0 to 15); the window ended when the queue was empty. Clear samples: slots 2, 3, 12, 13, 14 and 15 (six). The other ten were closed by another peer's gm build (cmake, ninja, cc1plus), gm-tool ranlib, claude sessions at 22 to 39%, and si up to 3448 KB/s. No probe started on a closed sample, and closed samples have no ledger line.

| Step | Slot | Result | Wall time |
|---|---|---|---|
| RC-ax+: 'ax+' removed (PID 1954528, exit 0) | 2 | red on 'fs.createReadStream flags ax+ reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.43 s |
| RC-as: 'as' removed (PID 1958988, exit 0) | 3 | red on 'fs.createReadStream flags as reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.66 s |
| RC-as+: 'as+' removed (PID 2009138, exit 0) | 12 | red on 'fs.createReadStream flags as+ reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.43 s |
| RC-zz: the invalid path restored to a sync gap throw (PID 2023823, exit 0) | 13 | red on 'fs.createReadStream flags zz reads or fails as Node does' only. Restored: RESTORED_IDENTICAL | 14.65 s |
| Node contract (PID 2035076, exit 0) | 14 | node: 117 names present across 25 subpaths | 0.14 s |
| txiki contract (PID 2042501, exit 0) | 15 | present 117, missing [] | 0.20 s |

Earlier witnesses for the same source (7d99242a, unchanged since): Node parity 685/685 (9.99 s) and txiki parity shared 685, gaps 21, mismatches [] (14.77 s), both in the partial window recorded above; RC-rs, RC-rs+, RC-w+, RC-wx+, RC-a, RC-ax and RC-a+ in the two earlier windows. All eleven flag red checks and both contracts have now run and passed.

Restore: /tmp/stageJ-good-txiki.js is the final committed source (7d99242a); each restore gave identical files, and the final `cmp` gave FINAL_IDENTICAL. `git status --short` was empty. No process of mine was left running.

Longest step: the txiki-style mutation runs (about 14.5 s each). The longest wait was the closed gate (10 of 16 samples).

## fx split: createReadStream signal, non-AbortSignal values (7aj), Phase A (2026-11-20)

Node oracle: runs/analysis/signal-type-node.mjs (clear sample, slot 2, PID 2051831, exit 0; output runs/analysis/signal-type-node.out). Synchronous ERR_INVALID_ARG_TYPE (TypeError) for: number 1 ("Received type number (1)"), string 'abc' ("Received type string ('abc')"), boolean true ("Received type boolean (true)"), null ("Received null"), {} ("Received an instance of Object"), a function ("Received function <name>"). An object with an aborted property and no addEventListener (`{ aborted: false }`) is accepted by the check and throws a plain TypeError "signal.addEventListener is not a function" with no code; it is not witnessed here.

txiki probe on a copy: runs/analysis/signal-type-txiki.out (clear sample, slot 2, PID of the mcp-probe run in that job): txiki threw the gap message for every value (no code), including the objects Node rejects with ERR_INVALID_ARG_TYPE.

Change (Phase A): src/txiki.js: describeReceived (null, function, object constructor name, string in single quotes, other primitives as type and value) and invalidArgType (TypeError with code ERR_INVALID_ARG_TYPE and Node's message); the createReadStream check is now 'aborted' in signal (as Node validates), then addEventListener for an object that has the property but no listener (still a gap). test/parity-cases.js: six shared cases (number, string, boolean, null, object, function), each through signalTypeError, which records code, name and message.

Pending (Phase B window): the Node probe, the Node and txiki parity runs, and the red check RC-aj: the check reverted to the gap for every value.

## Phase B: createReadStream signal, non-AbortSignal values (7aj), one window of 170 s, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. Samples: slot 0 closed (si 360, so 3028); slots 1 to 4 clear; the window ended when the queue was empty.

| Step | Slot | Result | Wall time |
|---|---|---|---|
| Node probe, runs/analysis/signal-type-node.mjs (PID 2053441, exit 0) | 1 | six ERR_INVALID_ARG_TYPE throws: "Received type number (1)", "Received type string ('abc')", "Received type boolean (true)", "Received null", "Received an instance of Object", "Received function fn" | 0.04 s |
| Node parity (PID 2053976, exit 0) | 2 | node: 691/691 shared cases match; 0/0 gaps throw the documented message; 9515 ms | 9.61 s |
| txiki parity, committed source 24997b36 (PID 2054317, exit 0) | 3 | shared 691, gaps 21, mismatches [], unexpectedGaps [] | 14.53 s |
| RC-aj: the check reverted to the gap for every value (PID 2056243, exit 0) | 4 | red on all six signal witnesses (numbers, string, boolean, null, object, function), each threw the gap message. Restored: RESTORED_IDENTICAL | 14.53 s |

Not witnessed, kept as a gap: `{ aborted: false }`, which Node accepts and then fails with a plain TypeError ("signal.addEventListener is not a function", no code); txiki keeps its gap for it. Reopen: a witness for that message, once the code-less TypeError is a parity target.

Restore: the good copy /tmp/stageK-good-txiki.js is the committed 24997b36 source; `cmp` gave identical files after RC-aj, `git status --short` was empty, and `git diff` of the source against 24997b36 is empty. No process of mine was left running.

Longest step: the txiki parity run and the red check (14.5 s each). The longest wait was one closed sample (slot 0).

## fx split: highWaterMark 0 and very large values (7ak), Phase A (2026-11-20)

Node oracle: runs/analysis/highwatermark-node.mjs, output runs/analysis/highwatermark-node.out (Node output only). fs.createReadStream: 0 is accepted and gives end then close with no data; negative -1, '8', 2.5 and Infinity throw ERR_INVALID_ARG_VALUE synchronously (TypeError, "The property 'options.highWaterMark' is invalid. Received <value>"); 2^40 creates and then errors asynchronously (ERR_MEMORY_ALLOCATION_FAILED, RangeError), then close; 1e300 creates and errors asynchronously (ERR_OUT_OF_RANGE, RangeError), then close. Readable and Writable: 0 gives push and write false; 2^40 and 1e300 give true; negative, string, fraction and Infinity throw as above.

txiki probe on a copy (/tmp/hwm-copy/txiki.js, a single-file copy; txiki.js imports only tjs modules): runs/analysis/highwatermark-body.js; before the change, output runs/analysis/highwatermark-txiki.out: fs 0 gap; Readable and Writable 1e300 threw ERR_INVALID_ARG_VALUE (Number.isSafeInteger rejects it); fs 2^40 and 1e300 differ from Node (RangeError with no code; 1e300 thrown synchronously). After the change, output runs/analysis/highwatermark-txiki-after.out: fs 0 ends then closes; Readable and Writable 0 and 1e300 match Node; the fs error paths are unchanged from before.

Change (Phase A): src/txiki.js: highWaterMarkOf uses Number.isInteger (Node's rule); the createReadStream line that threw the 0 gap is removed. test/parity-cases.js: six shared cases (fs 0, fs -1, Readable 0, Writable 0, Readable 1e300, Writable 1e300).

Open, not witnessed (remaining items on the ranked list): fs 2^40 and 1e300 error codes (txiki RangeError has no code; reopen: a probe mapping the tjs allocation and range errors to Node's codes); negative values give name Error in txiki (reopen: a probe of the name Node uses, TypeError, on the invalidArgValue path).

Pending (Phase B window): the Node probe, the Node parity run, the txiki parity run, and the red check RC-hwm: the fs 0 path returned to the gap throw.

## Phase B: highWaterMark 0 and very large values (7ak), one window of 379 s, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. 11 samples at 30 s (slots 0 to 10). Clear samples: slots 6 to 10 (five). Closed: a zig test process (cpu 97 to 100%) at slots 0, 2, 3 and 4; slot 1 and slot 5 had a clear checker reading but si 2188 and 2824 KB/s.

| Step | Slot | Result | Wall time |
|---|---|---|---|
| Node probe, runs/analysis/highwatermark-node.mjs (PID 2081313, exit 0) | 6 | 12 ERR_INVALID_ARG_VALUE matches in the output file | 0.57 s |
| Node parity (PID 2081635, exit 0) | 7 | node: 697/697 shared cases match; 0/0 gaps throw the documented message | 9.88 s |
| txiki parity on 83d7a7e0 (PID 2082284, exit 0) | 8 | mismatches []; unexpectedGaps [{name: 'fs.createReadStream highWaterMark 0', message: 'resolved'}]. FAILED: the gapCases entry for fs 0 still asserted the gap | 14.45 s |
| RC-hwm-zero: the fs 0 gap line restored (PID 2084580, exit 0) | 9 | red on 'fs.createReadStream highWaterMark 0 reads nothing and ends' only, got the gap message. Restored: RESTORED_IDENTICAL | 14.49 s |
| RC-hwm-int: Number.isSafeInteger restored (PID 2086611, exit 0) | 10 | red on 'stream.Readable highWaterMark 1e300 push returns true' and 'stream.Writable highWaterMark 1e300 write returns true' (both threw ERR_INVALID_ARG_VALUE). Restored: RESTORED_IDENTICAL | 14.46 s |

Result: open. The txiki parity run on 83d7a7e0 reported one unexpected gap (the stale gapCases entry), so the witness did not pass and nothing was pushed. Fix (test manifest only, no source change): the gapCases line 'fs.createReadStream highWaterMark 0' is removed from test/parity-cases.js. The txiki parity has not yet run on that commit.

Restore: /tmp/stageL-good-txiki.js is the committed source; each red check gave RESTORED_IDENTICAL, the final `cmp` gave FINAL_IDENTICAL, and `git status --short` was empty before the manifest edit.

Open items (not witnessed, as in Phase A): fs 2^40 and 1e300 give a RangeError with no code in txiki (Node: ERR_MEMORY_ALLOCATION_FAILED and ERR_OUT_OF_RANGE); negative values give name Error in txiki (Node: TypeError).

Reopen: one clear window running the txiki parity on this commit (expect shared 697, gaps 20, mismatches [], unexpectedGaps []), then push cacf5f53..HEAD (origin main is cacf5f53).

## Phase B: highWaterMark 0 and very large values (7ak), the rerun window of 332 s, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. 10 samples at 30 s (slots 0 to 9). Clear samples: slots 0, 2 and 9 (three). Closed: slot 1 (chromium GPU and renderer at 20 to 22% CPU), slot 3 (si 6636), slot 4 (chromium swiftshader at 49.5%, so 948), slot 5 (si 6748), slot 6 (si 1432), slot 7 (si 9372), slot 8 (so 7376). No step started on a closed sample.

| Step | Slot | Result | Wall time |
|---|---|---|---|
| txiki parity on f546a115 (PID 2096681, exit 0) | 0 | shared 697, gaps 20, mismatches [], unexpectedGaps [] | 14.62 s |
| Node parity (PID 2099073, exit 0) | 2 | node: 697/697 shared cases match; 0/0 gaps throw the documented message | 9.65 s |
| RC-hwm-zero: the fs 0 gap line restored (PID 2102054, exit 0) | 9 | red only on 'fs.createReadStream highWaterMark 0 reads nothing and ends' (got the gap message); unexpectedGaps []. Restored: RESTORED_IDENTICAL | 14.45 s |

RC-hwm-int was not rerun: its source (the Number.isInteger change in src/txiki.js) is unchanged since 83d7a7e0, and its red result is recorded in the Phase B ledger above (the window of 379 s).

Correction 1: the Phase B ledger above said the txiki parity had not yet run on the commit. This run corrects that: the txiki parity has now run on f546a115 and passed (mismatches [], unexpectedGaps []).

Correction 2: the Phase A probe for highWaterMark ran against a copy in /tmp (/tmp/hwm-copy/txiki.js, a single-file copy; before and after the change), as the Phase A brief asked. The signal Phase A probe (24997b36) did not: it imported the tree source, which was unchanged, not a copy. The earlier signal ledger line that says "on a copy" is wrong.

Restore: /tmp/stageM-good-txiki.js is the committed source (83d7a7e0); RC-hwm-zero gave RESTORED_IDENTICAL; the final `cmp` gave FINAL_IDENTICAL; `git status --short` was empty before the push.

Open, not witnessed (as in Phase A): fs 2^40 and 1e300 give a code-less RangeError in txiki (Node: ERR_MEMORY_ALLOCATION_FAILED and ERR_OUT_OF_RANGE); negative values give name Error in txiki (Node: TypeError).

## fx split: fs.createReadStream signal { aborted: false } without addEventListener (7al), Phase A (2026-11-20)

Node oracle: runs/analysis/signal-addlistener-node.mjs, one process per shape (output runs/analysis/signal-addlistener-node.out). { aborted: false }: synchronous TypeError, no code, "signal.addEventListener is not a function". { aborted: false, addEventListener: 1 }: the same. { aborted: true }: accepted; then error ABORT_ERR AbortError, then close (not in this change). { aborted: false, addEventListener() {} }: Node crashes the process at close with an uncaught TypeError "signal.removeEventListener is not a function" (not witnessed).

txiki probe on a copy (/tmp/sigal-copy/txiki.js, not the tree file): body runs/analysis/signal-addlistener-body.js. Before: runs/analysis/signal-addlistener-txiki-before.out, all three shapes gave the gap message. After: runs/analysis/signal-addlistener-txiki-after.out, { aborted: false } and { aborted: false, addEventListener: 1 } give TypeError "signal.addEventListener is not a function" (matches Node); { aborted: true } still gives the gap.

gapCases search before commit: no entry names this shape (the only gapCases line with "signal" is child-process signal abc). No stale entry to remove.

Change (Phase A): src/txiki.js: a new line throws new TypeError('signal.addEventListener is not a function') when the signal is not aborted and addEventListener is not a function; the existing gap line stays for the other shapes. test/parity-cases.js: two shared cases (plain and addEventListener 1), through signalTypeError (code, name, message).

Pending (Phase B window): the txiki parity run (must show mismatches [] and unexpectedGaps []), the Node parity run, and the red check RC-als: the new TypeError line reverted, both witnesses back to the gap.

## Phase B: fs.createReadStream signal { aborted: false } without addEventListener (7al), window of 673 s, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. 21 samples at about 32 s each (the window ran 673 s, longer than the ten minutes asked: the 21-sample cap held until RC-als got a clear sample). Clear samples: slots 10 and 19 (two of 21). Closed samples (no step started, no ledger line): slots 0 to 9, 11 to 18 and 20, from chromium GPU and renderer (up to 224% CPU), playwriter-ws-server (up to 86%), zig test and compile jobs of another peer, claude sessions at 21 to 25%, and si up to 11528 KB/s.

| Step | Slot | Result | Wall time |
|---|---|---|---|
| txiki parity on dc8ec98d (PID 2111082, exit 0) | 10 | shared 699, gaps 20, mismatches [], unexpectedGaps [] | 14.49 s |
| Node parity (PID 2116260, exit 0) | 19 | node: 699/699 shared cases match; 0/0 gaps throw the documented message | 9.59 s |
| RC-als (the new TypeError line reverted) | not run | no clear sample after slot 19 in the window | not run |

Result: open. RC-als did not run, so the stretch is not finished and nothing is pushed. The txiki parity and Node parity both passed on dc8ec98d, and the red check is the only step outstanding.

Restore: the working file equals the committed source (FINAL_IDENTICAL against /tmp/stageN-good-txiki.js); `git status --short` was empty.

Reopen: one clear window running RC-als (expect red only on the two signal witnesses, 'fs.createReadStream signal { aborted: false } without addEventListener throws a TypeError' and 'fs.createReadStream signal { aborted: false, addEventListener: 1 } throws a TypeError', with RESTORED_IDENTICAL), then push d8341ce6..dc8ec98d once.

Open, not witnessed (as in Phase A): { aborted: true } (Node emits ABORT_ERR AbortError; txiki still gaps it); an object with addEventListener and no removeEventListener (Node crashes at close with an uncaught TypeError).

## Phase B: red check RC-als for the signal without addEventListener (7al), window of 17 s, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. One clear reading in the window (slot 0: si 656, so 0, heavy-jobs clear); RC-als started on it. No other reading is recorded, because the window ended when the step finished.

| Step | Slot | Result | Wall time |
|---|---|---|---|
| RC-als: the TypeError line reverted (PID 2123669, exit 0) | 0 | red on both new witnesses only: 'fs.createReadStream signal { aborted: false } without addEventListener throws a TypeError' and 'fs.createReadStream signal { aborted: false, addEventListener: 1 } throws a TypeError'. unexpectedGaps []. Restored: RESTORED_IDENTICAL | 14.52 s |

The source has not changed since dc8ec98d, so the parity runs were not repeated in this window. The earlier passing runs on dc8ec98d (the Phase B window above) are cited: txiki parity shared 699, gaps 20, mismatches [], unexpectedGaps []; Node parity 699/699.

Restore: the working file equals the committed source (FINAL_IDENTICAL against /tmp/stageO-good-txiki.js); `git status --short` was empty.

Item 2 is done with this line. Still open within the item, not witnessed: { aborted: true } (Node emits ABORT_ERR AbortError; txiki gaps it), and an object with addEventListener and no removeEventListener (Node crashes at close with an uncaught TypeError).

## fx split: fs.createReadStream highWaterMark 2^40, 1e300 and -1 error shapes (7am), Phase A (2026-11-20)

Node oracle: runs/analysis/highwatermark-errors-node.mjs, one process per shape; output runs/analysis/highwatermark-errors-node.out. 2^40: stream created, then error ERR_MEMORY_ALLOCATION_FAILED RangeError "Failed to allocate memory", then close. 1e300: stream created, then error ERR_OUT_OF_RANGE RangeError "The value of \"size\" is out of range. It must be >= 0 && <= 9007199254740991. Received 1e+_300", then close. -1: synchronous ERR_INVALID_ARG_VALUE, name TypeError, "The property 'options.highWaterMark' is invalid. Received -1".

txiki probe on a copy (/tmp/hwmerr-copy/txiki.js; body runs/analysis/highwatermark-errors-body.js): before the change, runs/analysis/highwatermark-errors-txiki-before.out: 2^40 gave a RangeError with no code, "invalid array buffer length" (the new Uint8Array(size) in #readBlock; size is the block because the remaining count is Infinity with no end); 1e300 gave a RangeError with no code, "invalid array index"; -1 gave name Error.

gapCases search before commit: the gapCases block (lines 2715 to 2737) has no entry naming highWaterMark sizes, RangeError or the two codes. No stale entry.

Existing witnesses use errorOf, which records only code and message, so the name change does not affect them.

Pending (Phase B window): the txiki parity run (must show mismatches [] and unexpectedGaps []), the Node parity run, and the red checks RC-hwm-big (fileBlock reverted: the 2^40 and 1e300 witnesses go red) and RC-hwm-neg (invalidArgValue reverted: the -1 name witness goes red).

## Phase B: fs.createReadStream highWaterMark error shapes (7am), window of 444 s, 2026-11-20

Checker: scripts/heavy-jobs.cjs from bevy commit 495fff6 (exit 0 is clear). Gate: `vmstat 1 2` second sample, si and so both under 1000 KB/s. 13 samples at about 33 s (slots 0 to 12). Clear samples with a step started: slots 6, 7, 8 and 12 (four). The other nine were closed (no step started, no ledger line): a node check script and its mutant at 99 to 100% CPU (slots 0 to 5), a chromium renderer at 24.8% (slot 9), a zig test compile of another peer (slot 10), and si 5092 KB/s (slot 11).

| Step | Slot | Result | Wall time |
|---|---|---|---|
| txiki parity on 6e5194d2 (PID 2135718, exit 0) | 6 | shared 702, gaps 20, mismatches [], unexpectedGaps [] | 14.52 s |
| Node parity (PID 2137753, exit 0) | 7 | node: 702/702 shared cases match; 0/0 gaps throw the documented message | 9.63 s |
| RC-hwm-big: fileBlock reverted to new Uint8Array(size) (PID 2138127, exit 0) | 8 | red on 'fs.createReadStream highWaterMark 2^40 emits ERR_MEMORY_ALLOCATION_FAILED RangeError' (got error undefined RangeError) and on 'fs.createReadStream highWaterMark 1e300 emits ERR_OUT_OF_RANGE RangeError'. The -1 witness stays green. Restored: RESTORED_IDENTICAL | 14.49 s |
| RC-hwm-neg: invalidArgValue reverted to Error (PID 2140681, exit 0) | 12 | red only on 'fs.createReadStream highWaterMark -1 throws a TypeError' (got name Error, expected TypeError). Restored: RESTORED_IDENTICAL | 14.91 s |

Result: pass. Every listed step ran and passed. unexpectedGaps [] in the txiki parity run.

Restore: the working file equals the committed source (FINAL_IDENTICAL against /tmp/stageP-good-txiki.js); `git status --short` was empty.

Open within this item: the 1e300 error message is txiki's String(value) form ("Received 1e+300"), where Node prints "Received 1e+_300" (numeric separators). Not witnessed. The 2^40 message matches Node ("Failed to allocate memory"). The rule that maps any safe-integer allocation failure to ERR_MEMORY_ALLOCATION_FAILED is an approximation: Node's failure threshold is not known from the source, only the 2^40 case is witnessed.

## fx split: fs.createReadStream signal { aborted: true } and the no-removeEventListener shape (7an), Phase A (2026-11-20)

Node oracle, each shape in its own process: runs/analysis/signal-addlistener-node.mjs (argv abortedTrue, listenerNoop); output runs/analysis/signal-aborted-node.out. { aborted: true }: created, then error ABORT_ERR AbortError "The operation was aborted", then close, exit 0. { aborted: false, addEventListener() {} }: the process crashes at close with TypeError "signal.removeEventListener is not a function" (exit 1).

txiki probe on a copy (/tmp/sigab-copy/txiki.js; body runs/analysis/signal-aborted-body.js): before, runs/analysis/signal-aborted-txiki-before.out: { aborted: true } gave the gap message; the no-op listener shape ran data abcdefghij, end, close. After, runs/analysis/signal-aborted-txiki-after.out: { aborted: true } gives error ABORT_ERR AbortError "The operation was aborted", then close (matches Node); the no-op listener shape is unchanged.

gapCases search before commit: the only gapCases line with "signal" is child-process signal abc; no fs aborted-shape entry. No stale entry.

Change (Phase A): src/txiki.js: the gap line for a signal without addEventListener is deleted. The TypeError line above it still covers a signal that is not aborted, and FileReadStream destroys with abortError when signal.aborted. test/parity-cases.js: one shared case (streamEvents, expected ['error ABORT_ERR AbortError', 'close']).

Not witnessed, with reason: an object with addEventListener and no removeEventListener. Node dies at close with an uncaught TypeError (exit 1), so a parity witness cannot record a result on the Node side; txiki completes normally and never calls removeEventListener, so there is no matching behaviour to witness. Recording the divergence as the open item; reopen: a decision on whether txiki should reproduce the uncaught error (then a witness that captures uncaughtException on both sides), or to accept the divergence in docs/fx-split.md.

Pending (Phase B window): the txiki parity run (mismatches [] and unexpectedGaps []), the Node parity run, and the red check RC-abt: the gap line restored before the flags line, so the aborted-shape witness falls back to the gap.
