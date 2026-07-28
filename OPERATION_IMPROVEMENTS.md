# Operation Improvement Audit

A complete, prioritised list of everything we can improve across the four-repo
operation: **freddie** (agent harness), **acptoapi** (LLM SDK / protocol bridge),
**casey** (surveillance orchestrator), **anentrypoint-design** (UI SDK).

Produced by a read-only audit (nothing in the audited repos was modified) fanned
out one auditor per repo plus focused sub-audits (code-health, security,
reliability). Findings carry `file:line` where known. Severities are per-repo;
Section 1 collects the cross-cutting patterns that recur in *every* repo and are
the highest-leverage fixes.

---

## 0. Headline

- The single most valuable class of fix is **cross-cutting hygiene** (Section 1):
  the same four gaps -- CI not running tests, doc/code drift, tarball/publish
  fragility, duplicated primitives -- appear independently in every repo, so
  fixing them once as a shared discipline pays off four times.
- **One live blocker** (Section 2): `gm-plugkit@latest` is an un-bootable broken
  npm publish; it stalled this very audit and blocks the gm harness in all four
  repos until fixed in `AnEntrypoint/gm`.
- **The most urgent product bug** found is in casey: several code paths can
  silently **strand or drop an inbound report** during an LLM outage (Section 5,
  P1). For a livestock-disease reporting line, a lost report is the worst
  possible failure.
- Security posture is generally **good** -- casey's six documented invariants all
  verified as enforced (two minor wording/completeness caveats), but acptoapi's
  gateway key check is **not constant-time**.

---

## 1. Cross-cutting patterns (fix once, benefit four times)

### 1A. CI does not actually run the tests
- **acptoapi**: `.github/workflows/ci.yml:15-16` only `node --check`s `test.js`
  (parse, never execute); the publish job auto-bumps + `npm publish` on every
  push to main with `continue-on-error: true` (`ci.yml:46`) -> every push ships
  to npm with **zero behavioural gate** and a broken publish stays green.
- **anentrypoint-design**: `test.js` (38 real checks) is run by no workflow and
  there is no `"test"` npm script -- the one root correctness suite is unenforced
  (`.github/workflows/ci.yml:12-42`).
- **freddie**: `test.js` exists and is large (462 lines) but AGENTS.md itself
  warns "test.js can pass while the CLI is broken" -- the prescribed async-CLI
  smoke coverage should be audited.
- **casey**: no automated suite at all (deliberate), so CI is a dependency-free
  lint grep-gate only.
- **Fix**: every repo's CI should *execute* its `test.js` (gated behind
  available keys where needed) and a publish must be blocked on a green run. At
  minimum, a post-publish smoke that a fresh `npx <pkg>@latest` actually boots.

### 1B. AGENTS.md / doc-vs-code drift (pervasive, every repo)
- **casey**: AGENTS.md "Source map" is significantly stale -- it still documents
  `gateway-hooks.js` as holding `makeCaseHandler` (now a 55-line re-export
  barrel; handler lives in `src/hooks/handler.js`) and `dashboard/server.js` as
  a route monolith (now split into `src/dashboard/routes/*`). New modules
  (`src/safe.js`, `src/timestamp.js`, `src/store/*`) aren't in the map at all.
- **freddie**: AGENTS.md migration-debt list names five files that **no longer
  exist** on disk (`plugins/media/lib/vision.js`, `tts.js`, `transcription.js`,
  `plugins/image_gen`, `src/agent/model-discovery.js`).
- **acptoapi**: AGENTS.md says ACP autolaunch is "ON by default" (it is now
  opt-in behind `ACPTOAPI_ENABLE_ACP=1`); lists spawn packages that don't match
  code; `SPAWN_FIXES.md` is a third contradictory list; `.gm/next-step.md` is
  referenced by CLAUDE.md but doesn't exist.
- **anentrypoint-design**: its documented "200-line per-module cap" is dead (16
  modules over, up to 4.5x); the theme-scoping placement it uses contradicts
  what freddie's AGENTS.md tells consumers to do (see 6-MED).
- **Fix**: treat AGENTS.md as a gated artifact -- a lightweight check (paths it
  names must exist; a "last verified against tree at <sha>" stamp) so drift is
  caught, not discovered months later by an agent chasing a ghost file.

### 1C. npm tarball / publish integrity (the gm-plugkit failure mode, latent elsewhere)
- **anentrypoint-design (HIGH)**: `scripts/lint-css.mjs` is in the `files`
  allowlist (shipped) but imports five sibling `lint-*.mjs` that are **not
  shipped** -> `ERR_MODULE_NOT_FOUND` on import. It's off the public `exports`
  surface so it's dead weight today, but it is exactly the "tarball references an
  asset not included" trap.
- **anentrypoint-design (HIGH)**: the npm tarball is bloated with the entire
  gh-pages website (`dist/site`, `dist/slides`, `dist/preview`, `dist/ui_kits`,
  a duplicate `dist/src`) -- 272 files / 722 kB most consumers never use.
  Separate the Pages artifact from the npm `dist`.
- **acptoapi (MED)**: no `"files"` field and no `.npmignore`, so `.gitignore`
  governs -- the package ships `.gm/disciplines/**` (hundreds of scaffold JSONs),
  `test.js`, a 63 KB `AGENTS.md`, `.claude/settings.json`, and site/docs trees.
  Bloat + internal-artifact leak. (Note: if a `files` allowlist is *added* it
  must enumerate `lib/` recursively or it would introduce the gm-plugkit risk.)
- **Fix**: an explicit, minimal `files` allowlist per package **plus** a
  `prepublish`/CI check that every runtime `require`/`import` in the shipped set
  resolves inside the tarball. This is the generalised guard against Section 2.

### 1D. Duplicated primitives that have already drifted
- **acptoapi (HIGH, live bug)**: `splitBrandModel` is duplicated in
  `lib/server.js:395` (applies `normalizeModelId`, fixing dotted ids like
  `glm-5.1`) and `lib/passthrough.js:21` (returns raw) -- already drifted, so a
  dotted-version model via the passthrough path is mis-normalised. AGENTS.md's
  "keep in sync manually" has already failed.
- **acptoapi (MED)**: six hand-rolled `provider/model` splitters
  (`server.js:395`, `passthrough.js:21`, `sdk.js:6`, `chain-machine.js:35`,
  `acp-client.js:20`, `router.js:22`), three key-mask helpers with different
  thresholds (`keyring.js:127`, `extra-providers.js:690`, `errors.js:8`), a
  `BACKOFF_STEPS_MS` array copy-pasted in `keyring.js:6` and `sampler.js:3`, and
  SSE `data:` parsing reimplemented in ~17 files. Collapse each to one util.
- **casey (LOW)**: `evData` is imported statically almost everywhere but
  dynamically (`await import('../../overview.js')`) in
  `dashboard/routes/cases.js:408` and `routes/reports.js:175` -- canonical home
  is `safe.js`; drop the indirection. (Timestamp parsing and HTML-escaping were
  already consolidated -- good.)
- **Fix**: a shared internal `util/` per package for splitters/masks/SSE/backoff;
  a grep-gate forbidding a second copy.

### 1E. Auth / constant-time hardening
- **acptoapi (HIGH)**: gateway API-key check is `key !== requireAuth`
  (`lib/server.js:1222`) -- **not** `timingSafeEqual` (none exists anywhere in
  lib/bin); timing side-channel. Non-loopback bind only *warns* unless
  `ACPTOAPI_REQUIRE_AUTH_ON_BIND=1`.
- **casey**: by contrast, does this correctly (scrypt + `timingSafeEqual` for
  both password and cookie) -- the pattern to copy.
- **Fix**: constant-time compare for acptoapi's gateway key; consider making
  strict-bind the default.

### 1F. Dependency vulnerabilities (Dependabot) go unremediated
- **freddie**: pushing this audit surfaced GitHub's report of **24 open
  vulnerabilities on the default branch (9 high, 9 moderate, 6 low)**
  (`/security/dependabot`). acptoapi's audit independently flagged its
  `@google/genai` subtree carrying documented prior transitive CVEs, and its
  caret-ranged/unpinned deps.
- **Fix**: turn on Dependabot (or an `npm audit` / `osv-scanner` gate) in CI for
  each repo, triage the highs first, and treat the alert count as a tracked
  metric. freddie already has an `osv-auto-bump.yml` workflow -- confirm it is
  actually running and clearing alerts rather than sitting idle.

### 1G. npm-`latest` cross-repo coupling (DX)
- freddie/thatcher/acptoapi are consumed downstream **only** via the `latest`
  dist-tag (never `file:` siblings). A fix in a lower layer requires
  push -> CI publish -> `npm install` downstream before it is even witnessable;
  casey's AGENTS.md explicitly laments the lost local-edit-to-live loop.
- **Fix**: a documented, opt-in dev-link mode (npm link / `file:` override behind
  an env flag) for cross-repo iteration, without changing the production `latest`
  policy.

---

## 2. Tooling blocker: gm-plugkit broken publish (BLOCKS the whole harness)

External repo `AnEntrypoint/gm`, but it blocks gm in all four repos and stalled
this audit; reproduced live this session.

1. **wasm hash skew**: `gm-plugkit@2.0.1990` pins `plugkit-wasm@0.1.915` with
   `plugkit.sha256 = 874f5a...`, but that npm version now serves a wasm with
   sha `eacc4a...` -> bootstrap hard-fails the integrity check.
2. **missing shipped file**: `plugkit-wasm-wrapper.js:20` statically
   `import`s `./wrapper/wasi-shim.js`, but the `wrapper/` dir is entirely absent
   from the published tarball (`npm pack` listing confirms) -> crash-loop.
3. **boot resilience**: the bootstrap installs the wrapper into `~/.gm-tools`
   without its sibling ESM modules (`gm-log.js`, `gm-process.js`), and the wasm
   self-heal fetches from `github.com/AnEntrypoint/plugkit-bin/releases` which
   returns **HTTP 403 behind the agent proxy** with no npm fallback.
- **Workaround used** (so this audit could run): boot the last self-contained
  build `2.0.1972` with its ABI-matched `plugkit-wasm@0.1.903`.
- **Fix**: realign the published wasm hash with the pinned manifest; add
  `wrapper/` to the `files` allowlist; make self-heal fall back to `npm pack
  plugkit-wasm@<ver>` when the GH release is blocked; add a CI gate that a fresh
  `bunx gm-plugkit@latest spool` actually boots and serves before publish. (This
  is a concrete instance of pattern 1C.)

---

## 3. freddie (agent harness)

### HIGH
- **Migration-debt: direct provider fetch bypassing acptoapi** -- the layering
  mandate says acptoapi owns all upstream LLM connectivity, but
  `src/agent/adapters/xai_adapter.js`, `src/agent/adapters/codex_responses_adapter.js`,
  and `src/imagegen/provider.js` still `fetch` provider APIs directly. Add the
  endpoints to acptoapi and route through it; delete the bespoke fetch (fewer
  places auth/backoff/redaction live).
- **Contact-facing toolset guard** -- `bootHost` always discovers freddie's
  `plugins/` regardless of a consumer's own root, so a consumer that sets
  `enabledToolsets:['core']` for an untrusted end user exposes callable
  `bash`/`edit`/`write`/`send_message` to public inbound text (found live as
  `['cases','core']` in a downstream consumer). Add a runtime guard/lint that
  refuses (or loudly warns on) a bare `core` toolset in a contact-facing
  distribution so this cannot silently regress.

### MEDIUM
- **AGENTS.md migration-debt list is stale** -- names five files that no longer
  exist; update it to the three that actually remain (3-HIGH) and mark the rest
  completed, so agents stop chasing ghosts.
- **`test.js` is 462 lines vs the documented <=200 cap** -- either the cap is
  obsolete (update the doc) or the file has accreted and should be split;
  reconcile, and verify the async-CLI-verb smokes AGENTS.md prescribes exist.

### LOW / hygiene
- **gm runtime artifacts in the working tree** -- many untracked
  `.gm/disciplines/codeinsight/ci-*.json` and `.gm/.instructions-shipped-manifest.json`
  are generated by the watcher; confirm they're in a managed `.gitignore` in all
  four repos so they never get accidentally committed or block a clean-tree push.

---

## 4. acptoapi (LLM SDK / protocol bridge)

Backlog note: `.gm/prd.yml` is a 196-item *history* (194 completed, 2 externally
blocked), so there is no real code backlog -- these are audit-derived.

### HIGH
- **CI never executes tests + silent publish** -- see 1A (the canonical case).
- **`splitBrandModel` duplicated and drifted -> live routing bug** -- see 1D.
- **Gateway key check not constant-time** -- see 1E.
- **ACP daemon auto-spawn supply-chain surface** -- `lib/acp-launcher.js:76-179`
  launches 10 daemons via `npx --yes <third-party-pkg>` at *latest*
  (dependency-confusion/typosquat risk). Mitigation already exists but is
  **undocumented**: it is opt-in behind `ACPTOAPI_ENABLE_ACP=1` (off by default).
  Document it and consider pinning the spawned package versions.
- **`lib/availability.js` cache grows unbounded, disk-persisted, non-atomic
  write** -- one Map entry per distinct model string ever seen, never
  evicted/capped, flushed monotonically to `~/.acptoapi/availability-cache.json`
  via non-atomic `writeFileSync` (corrupts on mid-write crash -> self-heals to
  empty, losing all learned health). Cap/evict + atomic temp-write-then-rename.

### MEDIUM
- **`swe-bench-scores.js` scrapes a third-party site's internal HTML**
  (`__NEXT_DATA__` from `benchlm.ai`), throwing when markup shifts -- a runtime
  dependency on an undocumented external page; AGENTS.md still calls it a "static
  curated dict."
- **Hardcoded model tables stale/fabricated** -- `model-probe-live.js` `KNOWN`
  lists `codex-cli: ['code-davinci-003']` (never existed) and placeholder ACP
  ids; `isAvailable()` still branches on the removed `gemini-cli`;
  `PROVIDER_DEFAULTS` has EOL `bedrock: anthropic.claude-instant-v1` and
  `gemini-1.5-flash`.
- **Four+ competing provider->envKey maps** despite "keyring is the single source
  of truth" (`openai-brands.js`, `provider-maps.js`, `passthrough.js:16`,
  `media-passthrough.js`, plus inline checks) -- a new provider must be added in
  several places.
- **>25 modules have zero test coverage** -- including `translate.js` (the core
  any-to-any pipeline), the whole `errors.js` `BridgeError` taxonomy, all
  non-anthropic `lib/formats/*`, all `lib/providers/*`, and `acp-launcher.js`;
  the `/v1/messages` path Claude Code actually calls is never exercised.
- **Dead subsystems** -- `machine.js` `createStreamActor` (re-exported, zero
  callers) and the `router-stream.js`->`router.js`/`transformers.js`/
  `circuit-breaker.js` cluster (unreachable; the `'router'` provider is never
  selected). Wire or delete.
- **npm tarball over-ships** -- see 1C.

### LOW
- `lib/availability.js:133` shadows the top-level `fs` module inside `score()`.
- `lib/server.js` is one ~1600-line handler with ~42 manual
  `pathname===... && method===...` branches -- ordering-dependent; a small router
  table would harden it.
- `gh-pages.yml:25` runs `npx --yes flatspace@latest` (unpinned build tool in CI).
- Dependencies caret-ranged/unpinned; `@google/genai` is a heavy subtree with
  documented prior transitive CVEs; `engines: node>=20.19.0` EBADENGINE-warns on
  20.0-20.18.
- Two same-named `classifyError` functions (`chain-machine.js:6` reason-string vs
  `errors.js:74` error-class) -- documented but a naming trap.
- **Sound (checked, no action)**: all-keys-in-backoff handling, the
  sampler<->auto-chain circular-dep avoidance, the `refreshAll` serialization
  fix, bounded run-history.

---

## 5. casey (surveillance orchestrator)

### HIGH -- reliability: an inbound report can be silently stranded/lost
These are the most important product findings; for a disease-reporting line a
lost report is the worst failure.
- **P1.1 -- a degraded *live* turn is never re-driven by recovery, only by a
  reboot.** `hooks/handler.js:405-423` writes the `QUEUED-FOR-AGENT` marker only
  when `llmStatus()` reports `ok===false` at the gate. If the status read throws
  (`:407` swallows to `down=false`) or the provider was ok at the gate then the
  turn itself fails, the code goes degraded and sends nothing **without writing
  the marker** -- so `drainQueuedTurns` (which keys on the marker) can never
  re-drive it, and `resumePendingTurns` runs only once at boot. On a long-lived
  process that recovers without restart, the inbound is stranded indefinitely.
- **P1.2 -- empty `msgId` collapses distinct queued messages into one.**
  `messageId()` returns `''` for adapters with no id; the dedup at
  `handler.js:409` then makes every message during an outage produce the
  identical marker `QUEUED-FOR-AGENT:`, so only the first queues and the rest are
  dropped as "deduped." Real multi-message loss for any id-less adapter path.
- **P1.3 -- a deterministic outbound during an outage "completes" a queued real
  report.** The drain/resume treat *any* outbound/draft as completing every
  queued msgId before it; a STOP/HELP-resume ack or operator stage-note emitted
  above the queue gate marks a queued report `completedAfter` so the agent never
  processes its content.
- **P2.4 -- recovery drain is edge-only and capped with no re-trigger.**
  `onRecover` fires once per down->up edge; `drainQueuedTurns` is bounded
  (`maxCases=200`/`maxRedrives=50`) and never re-invokes itself on hitting the
  cap, and there is no periodic drain. A provider that recovers and stays up
  leaves the tail permanently queued.
- **P2.5 -- recovery drain silently dropped when it races the boot resume
  sweep** (shared `_draining` guard returns `{deferred:true}` and `onRecover`
  doesn't retry).
- **Fix cluster**: write the `QUEUED-FOR-AGENT` marker on *any* non-delivering
  turn (not just the gate path); make the drain periodic and self-re-triggering;
  fix the empty-`msgId` dedup key; scope "completes" to the specific msgId.

### MEDIUM
- **Provenance subsystem (`src/core/`, `src/engine/`, `src/packs/`) is entirely
  unwired dead code** -- `write-path.js` ("the ONE function every writer calls")
  has zero callers, as do `rule-engine.js`, `aggregate.js`, `interpretation.js`,
  etc. Most is intentional future scaffolding (AGENTS.md says so), but three
  modules (`escrow-export.js`, `quality-flags.js`, `reputation.js`) are
  undocumented *and* unreferenced -- document or delete. Bigger picture: ~13
  files / ~50 KB are completely unexercised (no callers, no tests). Decide: wire
  it into `case_report` (AGENTS.md enumerates the migration targets) or clearly
  fence it as scaffolding.
- **`makeCaseHandler` is a single ~870-line closure** (`src/hooks/handler.js`) --
  STOP/HUMAN short-circuit, queue gate, runTurn loop, dedup, media enrichment,
  burst-replay and delivery all in one function; extract the queue-gate and
  STOP/HUMAN branches.
- **`CaseStore` (~60 methods, 70 KB) and `buildCaseToolset` (~550 lines)** mix
  separable concerns (config validation, operator-identity learning, report
  merge) -- split.
- **AGENTS.md source map stale** -- see 1B (highest-ROI doc fix here).
- **Stale `.claude/workflows/*` audit definitions** reference deleted files
  (`src/extract.js`, `src/sim/*`) and functions -- any agent running them is
  misdirected.
- **Coverage-gap paging flaps** -- `_checkCoverageGap` clears on any reply then
  re-pages purely from clock aging as that reply passes the window, so a team
  replying near the window boundary gets re-paged every cycle.
- **Escalation alerts indistinguishable from routine + `since_ms` always null** --
  `breachNotifier` is constructed with no `opts`, so `escalated` is always false
  and every payload is `severity_tier:'breach'`; `sinceMs`/`slaWindowMs` are
  never passed so the documented `since_ms`/`sla_window_ms` fields are dead.

### LOW
- **Zombie-receive is a dashboard false-green by default** -- a channel that
  connected then went silent still reports `ok`; self-heal is gated on
  `CASEY_RECEIVE_SILENCE_MS` which defaults to 0 (off). Documented tradeoff, but
  a real false-green out of the box.
- **`llmStatus` probe fails *open*** (`handler.js:407` -> `down=false` on throw),
  defeating the queue gate rather than queueing; prefer explicit fail-closed.
- **`ctx.crashes` array grows unbounded** (`supervisor.js:252`) -- cosmetic leak.
- **Burst-replay strands remaining buffered messages if a replay throws**
  (`handler.js:885-899`).
- **Security caveats (both minor, no bypass found)**: `casey up` *drop-and-continues*
  (doesn't hard-fail) when whatsapp is only in the default channel list without
  `WHATSAPP_APP_SECRET` -- AGENTS.md's "hard-fail" overstates that one path (the
  security property still holds; whatsapp is filtered out); and `/api/audit.csv`'s
  `reason` cell is the one output column not run through the external_id scrub.
- **Static-import `evData`** in the two dashboard routes -- see 1D.
- **Verified sound** (no action): SQLITE_BUSY retry proxy, exit-44 config-fatal,
  drain deadline, fork-argv safety, watch allowlist, auto-deploy ff-only refusal,
  STOP/HUMAN above the queue gate, webhook timeout/no-PII. The six security
  invariants (WhatsApp HMAC, dashboard auth, PII-free projections, tier
  fail-closed, HTML escaping, PII-free exports) all verified ENFORCED.

---

## 6. anentrypoint-design (UI SDK)

Backlog note: gm PRD is essentially fully resolved (450 rows, all completed), so
value here is in unenforced rules and build/tarball fragility.

### HIGH
- **Tarball ships broken-on-import `lint-css.mjs`** -- see 1C.
- **npm tarball bloated with the entire gh-pages website** -- see 1C.
- **`test.js` (38 checks) not run in CI or `npm test`** -- see 1A.
- **200-line-per-module cap is dead** -- 16 modules over, up to 4.5x
  (`editor-primitives.js` 920, `freddie.js` 879, `components/shell.js` 805,
  `content.js` 794, `overlay-primitives.js` 783, `chat.js` 592). Add a line-cap
  lint or retire the rule.
- **Inline-style ban never scans `src/`** -- `lint-inline-styles.mjs:24`
  `SCAN_DIRS=['ui_kits','site']`; real layout-property inline styles live in
  `content.js:74,763`, `freddie.js:182,187`, `voice.js:47`,
  `editor-primitives.js:156,413,415`, and a `display:none` inline in
  `kits/os/freddie/pages-chat.js:298`. Finish the sweep and widen `SCAN_DIRS`.

### MEDIUM
- **Build mutates a committed source file in place** -- `build.mjs:210-268`
  overwrites `src/styles.js` with a base64 blob and restores it in `finally`; a
  hard kill mid-build leaves the blob in the tracked file (can get committed).
  Write the decoder to a temp/`dist`-only file instead.
- **Theme-scoping divergence -- a live dark-mode trap** -- the SDK canonically
  puts `class="ds-247420"` AND `data-theme` on the same `<html>` node, but
  freddie's AGENTS.md documents splitting them across `<html>`/`<body>`, which
  under the SDK's selector prefixing **won't match** and silently breaks dark
  mode. Reconcile to one supported placement and fix the wrong doc.
- **Visual-regression baselines never checked in CI** -- 78 PNG baselines and a
  `visual:check` script exist but no workflow runs it; with a concurrent
  auto-committing UX process, silent visual drift is likely. Wire it in.
- **`freddie.js` is an 879-line god-module** defining 21 route pages in one
  file, while `src/kits/os/freddie/` already shows the intended split -- apply it.
- **a11y gate only scans `preview/*.html`**, not the `ui_kit` pages consumers
  actually ship (`a11y-audit.mjs:15`). Broaden the target set.
- **`exports` map (~60 subpaths) hand-maintained**; `gen-exports.mjs` exists but
  isn't wired to build/CI, so a future kit add/rename can desync it without
  failing CI. Add `gen-exports --check`.
- **No runtime guard for the "component is not a function" silent-mount
  failure** freddie's docs call out; a dev-mode assertion in `mount()`
  (`src/index.js:51`) that a resolved component is callable would surface it.

### LOW
- Spacing-token migration is only partially done -- ~629 raw `px` literals remain
  in `app-shell.css` (ratchet frozen at 356); promote the ratchet toward zero.
- `publish.yml` auto-patch-bumps and commits `dist/` churn on every push -- noisy
  history and a rebase-regression footgun (decoupling committed `dist` fixes it).
- Font-URL rewrite points at `unpkg.com/anentrypoint-design@latest/dist/fonts/`
  -- a no-op today but a latent `@latest`-pinned-absolute-URL tarball risk if a
  `@font-face` is ever added.
- Onboarding gap -- no "how to add a component/kit/page" or local-iteration guide
  in-repo (the real rebuild + `cp dist/247420.*` pain is documented only
  downstream in freddie).
- **Sound**: no real component duplication; thebird's windowing **is** already
  migrated into `src/kits/os/`; a11y uses real axe-core (WCAG 2.1 AA, blocking);
  all public `exports` targets resolve.

---

## 7. Suggested sequencing

1. **Unblock the harness** -- fix the gm-plugkit publish (Section 2); it gates
   every repo's gm workflow.
2. **Stop the bleeding in casey** -- the P1 report-stranding cluster (5-HIGH);
   real data loss on a disease-reporting line.
3. **Make CI real** -- run `test.js` and block publish on green in every repo
   (1A); add the "every shipped import resolves in the tarball" check (1C). These
   two would have caught both the gm-plugkit break and the design `lint-css.mjs`
   break automatically.
4. **De-drift the docs** -- refresh each AGENTS.md against the tree (1B), highest
   ROI in casey.
5. **Harden acptoapi** -- constant-time key (1E), fix `splitBrandModel` drift
   (1D), cap the availability cache (4-HIGH).
6. **Consolidate primitives + delete dead code** -- shared splitter/mask/SSE/
   backoff utils (1D); acptoapi `router-*`/`createStreamActor` and casey
   provenance modules (wire or delete).
7. **Slower hygiene** -- tarball slimming, line-cap/inline-style/visual-regression
   lints in design, freddie migration-debt to acptoapi.
