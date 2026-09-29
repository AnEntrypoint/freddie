# Agent Note: Authorization seam (`ctx.authorization`)

Status: implemented

## Problem

freddie's credential seam could answer "what is behind this environment-variable name" and "what record does this plugin hold", but had no way to *obtain* a credential that requires a conversation with the human — open this page, paste that code, pick an account. `packages/credentials/credentials` owns references and records; nothing owned the flow that fills one. freddie's own docs had already reserved the slot before any code existed: `packages/credentials/README.md` lists an `authorization/` row for `ctx.authorization`, `docs/capability-seams.md` describes `ctx.authorization` as a seam, `docs/module-graph.md` gives it `credentials`, `invariants`, and `llm` as dependencies, `docs/subsystems/credentials.md` documents `authorization/settled` as an `@mode emit` event with `key` and `settlement`, and `docs/config-catalog.md` plus `docs/event-producer-consumer.md` both pointed at `packages/credentials/authorization` with "package scaffold only, no `src/` implementation present yet".

## Gate: product-neutral core, not a DeepSeek-account binding

The audit's stop condition was a DeepSeek-account OAuth binding with no product-neutral core. dsh's `packages/credentials/authorization` is not one. Its whole vocabulary is protocol-neutral: `AuthorizationMethod` (`{ id, label }`), `AuthorizationNotice` (`{ message, url?, code? }`), the `text`/`secret`/`select` prompt union, `AuthorizationOutcome`, and `AuthorizationSettlement`. There is no vendor URL, no DeepSeek account endpoint, no provider id, and no token format anywhere in the source. Its only imports are `Context` and `Service` from cordis, the `CredentialKey`/`CredentialRecord` **types** from dsh-credentials, and `HarnessError` from dsh-llm — a protocol-shaped core, which is what got ported.

Corroborating evidence, all from freddie's own tree rather than from upstream's README: the three docs above already name the seam, the event, and the dependency set, and `docs/event-producer-consumer.md` already lists `authorization` as both the dispatcher and a listener of `authorization/settled`, and as the listener of `credentials/record-updated` — the commit-confirmation path this port depends on.

## Decision

New package `packages/credentials/authorization` (`@freddie/freddie-authorization`), ported from `deepseek-ai/deepseek-harness`'s `packages/credentials/authorization/src/index.ts`, read from raw.githubusercontent.com and never from a README, a note, or a recollection.

- `src/index.js` — `AuthorizationService extends Service` with `static inject = ['credentials']`, registered as `super(ctx, 'authorization')`. `AuthorizationError extends HarnessError` (stable `code`) and `AuthorizationDeclinedError` (code `DECLINED`). Surface: `registerFlow`, `list`, `describe`, `cancel`, `begin`. `registerFlow` is a `ctx.effect(function* () { … yield disposer })` that also cancels a live attempt on withdrawal.
- `src/invariant.js` — the companion every freddie package owes: `ctx.invariants.register(PACKAGE_NAME, install)`, where `install` listens to `authorization/settled` and fails if the key is still in flight after it settled, or if the event fired with no live authorization service. Single-flight release is the one contract this seam can break silently by holding a key forever.
- `src/types.js` — JSDoc typedefs only, no runtime exports, mirroring the sibling `packages/credentials/credentials/src/types.js` so a Client compilation face reads the same signature the Host emits.

Adaptations, each forced by freddie's buildless plain-JavaScript rule or by a freddie convention upstream does not share:

- Upstream's `declare module '@deepseek-ai/cordis'` augmentation (which types `ctx.authorization` and the `authorization/settled` event) has no counterpart in buildless JS; no freddie source file carries a module augmentation. The event's contract moved into JSDoc prose above the type aliases, on the same `@mode emit` / `@param` terms `docs/subsystems/credentials.md` already documents.
- Upstream's `import type { … }` block became `src/types.js` typedefs, aliased into `src/index.js` with `@typedef {import('./types.js').X} X`.
- `@deepseek-ai/dsh-credentials` → `@freddie/freddie-credentials` (the real `parseCredentialKey` at runtime, not just the type), `@deepseek-ai/dsh-llm` → `@freddie/freddie-llm` for `HarnessError`; `package.json` follows the sibling's `main: "src/index.js"` with `exports` for `.`, `./invariant`, `./types`, `./src/*`, `./package.json` instead of upstream's `lib/` build output.
- Two of upstream's invariants were TypeScript-only — a non-empty methods tuple and a branded `CredentialKey`. Buildless JS cannot enforce either at compile time, so `admit()` realizes both as runtime rejections at registration: `BAD_KEY` and `NO_METHOD`. This is also the fail-safe choice: a flow that cannot address its key or offers no way to begin fails the registering plugin's activation, where the mistake is, instead of failing inside `begin()` at the moment a user asks for a credential.
- Upstream's the localized README and `tsconfig.json` have no freddie counterpart, and upstream's tests are excluded by this repository's no-test-file rule.

**No new npm dependency.** The package declares only `@freddie/freddie-credentials`, `@freddie/freddie-invariants`, `@freddie/freddie-llm`, and `@freddie/cordis` — all four already in freddie's workspace graph, listed in both `peerDependencies` and `devDependencies` as `"*"` per the sibling convention. Nothing was added to the supply chain to ship this.

## Security posture

This seam is a trust boundary, and the port is built to deny rather than to allow:

- **No credential value ever reaches a log, an event payload, an error string, or an entry.** Notices, entries, settlements, and error messages name keys and statuses only. A `grant` payload is opaque and passes through `ctx.credentials` without being read here. Verified live: a flow committing `sk-live-ZZZ-UNIQUE-9999` produced five log lines, and the token appeared in none of them.
- **A flow that did not commit is a failure.** `NOT_COMMITTED` is thrown both when no `credentials/record-updated` for the key was observed during the attempt and when the record is absent afterwards — reporting `authorized` on an unwritten record would send a caller away believing a credential exists.
- **Cancellation wins over a late write.** `commit()` re-checks that its own attempt is still the live holder of the key before writing, so a withdrawn or superseded attempt cannot land a record the human withdrew from.
- **Never stall on a broken surface.** Notice rendering is contained; a surface that cannot render loses the notice, never the attempt.
- **Least privilege in the interaction.** A flow receives only `notify`, `prompt`, and `commit` scoped to one attempt, and never the caller's surface, the registry, or another key's record.

Verification deliberately used an in-memory `CredentialProvider` rather than `credentials-local`, so no synthetic secret was written to the real `$FREDDIE_HOME/.credentials.yaml` or to any scratch file.

## Alternatives considered

**Ship nothing and leave the slot empty.** Rejected: freddie's docs already promise the seam, and without it every plugin that needs an OAuth grant has to invent its own prompt lifecycle, its own in-flight guard, and its own commit confirmation — the three things most likely to be gotten wrong at a trust boundary.

**Port it as a DeepSeek-specific authorization package.** Rejected at the gate: there is no DeepSeek-account code in upstream's source to port, and inventing one would be inventing behavior from a recollection.

**Fold the registry into `@freddie/freddie-credentials`.** Rejected: the credentials seam is a provider abstraction that never prompts a human, and `docs/module-graph.md` already draws `authorization` as a dependent of `credentials`, not a part of it.

## Consequences

Verified live on the real stack — real `Context`, real `AuthorizationService`, a real `MemoryCredentials extends CredentialProvider` (freddie's actual abstract seam base with its real `notifyRecordUpdated`), real `HarnessError`, real cordis logger with a capturing exporter — three `exec_js` runs, no stubs and no mocks:

Run 1 — surface, happy path, error taxonomy, and settlement fan-out:
```
ctx.get(credentials) === store = false
ctx.get(authorization) === service = false
AuthorizationService.inject = ["credentials"]
list() = [{"key":"llm-demo/demo-provider","label":"Demo provider","methods":[{"id":"oauth","label":"Sign in"},{"id":"paste","label":"Paste a token"}],"inFlight":false}]
begin() happy path = {"status":"authorized"}
stored record = {"kind":"grant","payload":{"token":"sk-live-ZZZ-UNIQUE-9999","plan":"pro"}}
notices rendered = [{"message":"open this page","url":"https://example.test/device","code":"ABCD-EFGH"}]
settlements so far = [["llm-demo/demo-provider","authorized"]]
DUPLICATE_FLOW = AuthorizationError/DUPLICATE_FLOW
BAD_KEY = AuthorizationError/BAD_KEY
NO_METHOD = AuthorizationError/NO_METHOD
NO_FLOW = AuthorizationError/NO_FLOW
UNKNOWN_METHOD = AuthorizationError/UNKNOWN_METHOD
begin() with an already-aborted signal = {"status":"cancelled"}
describe() while in flight = {"key":"llm-demo/hanging","label":"Hanging","methods":[{"id":"wait","label":"Wait"}],"inFlight":true}
begin() cancelled by cancel() = {"status":"cancelled"}
describe() after settle = {"key":"llm-demo/hanging","label":"Hanging","methods":[{"id":"wait","label":"Wait"}],"inFlight":false}
declined prompt = {"status":"cancelled"}
notice failure contained = {"status":"authorized"}
list() after dispose = [{"key":"llm-demo/hanging",…},{"key":"llm-demo/declined",…},{"key":"llm-demo/silent",…},{"key":"llm-demo/vanish",…},{"key":"llm-demo/broken-surface",…}]
settlements (all) = [["llm-demo/demo-provider","authorized"],["llm-demo/hanging","cancelled"],["llm-demo/declined","cancelled"],["llm-demo/silent","failed"],["llm-demo/vanish","failed"],["llm-demo/broken-surface","authorized"]]
token reached a log = false
token reached a notice = false
token reached a settlement = false
```
The `ctx.get(...) === … = false` lines are not a port defect: `ctx.get` is a mixin of `reflect.get`, which returns a traceable Proxy rather than the instance. Calling `begin()` and `describe()` *through* that proxy works, which is what the two `{"status":"authorized"}` lines and the in-flight `describe()` show.

Run 2 — the invariant companion against the real `InvariantRegistry`:
```
companion name/inject = ["authorization-invariant",["invariants"]]
invariants module exports = ["InvariantError","InvariantRegistry","default"]
companion.apply returned a disposer = "function"
begin with the invariant companion installed = {"status":"authorized"}
```

Run 3 — a broken surface and a broken watcher at once, with the logger capturing:
```
logger capture works now = ["probe: direct warn"]
outcome with a broken surface and a broken watcher = {"status":"authorized"}
record still committed = {"kind":"grant","payload":{"token":"sk-live-ZZZ-UNIQUE-9999"}}
captured warnings = ["probe: direct warn","authorization: the interaction surface failed to render a notice","Error: socket closed\n    at Object.notify ([eval]:56:42)\n    at Object.notify (…/authorization/src/index.js:352:25)…","authorization: an authorization/settled listener for \"%s\" failed llm-demo/noisy","Error: watcher exploded\n    at [eval]:53:49\n    at Object.apply (…/framework/cordis/src/reflect.js:311:24)\n    at AuthorizationService.settle (…/authorization/src/index.js:282:26)…"]
token reached any log message = false
log count = 5
INVARIANT listener failure rethrown = "Error/INVARIANT"
```
A throwing notice renderer and a throwing `authorization/settled` listener both lost only themselves: the record still committed, the caller still saw `authorized`, and the token reached no log line. The literal `%s` in the fourth message is an artifact of the harness's own `args.join(' ')` rendering, not of the logger. The first two runs captured zero messages because cordis's default target level is `INFO` (1) and `warn` is `WARN` (2) on a scale where a lower target suppresses a higher level; the exporter had to declare `levels: { default: 3 }`. That is a pre-existing cordis default, not something this port changed — and it means a deployment that ships this seam without raising the level will not see these contained-failure warnings.

`node scripts/publint-all.js` passes this package with zero messages (`publint` reports `(none)`, `errors: 0`), including the script's own publication-closure check. `pnpm run publint` itself cannot complete in this checkout: pnpm's dependency-status pre-run tries `pnpm install`, which fails on `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @google/genai@1.52.0` — a build-script-approval blocker that predates this package and is unrelated to it. Running the script it invokes, directly, over every workspace package, the only failure is `packages/llm/llm-pi-ai` (`pkg.main is src/index.js but the file does not exist`), a sibling's in-flight package that has no `src/` yet.

Docs touched, all from stale "package scaffold only" text to the real source path: `docs/subsystems/credentials.md` (two `Source:` lines), `docs/config-catalog.md` (the `@freddie/freddie-authorization` row), and `docs/event-producer-consumer.md` (the `authorization/settled` row, now citing `src/index.js:41`). No generator for these files exists in this checkout — `scripts/` holds no `gen-doc-graphs` or `gen-cordis-catalog`, and no `gen-doc-graphs`/`verify-doc-graphs` npm script — so the "do not edit by hand" headers are themselves stale and regeneration is not an option; the correction was made in place, following each file's own citation convention.

What this buys: one place a plugin registers how to obtain its credential, one attempt per key, and one confirmation that the credential actually landed, with no credential value ever crossing a log or an event. What it costs: no flow ships here, so nothing can be authorized until a plugin registers one; commit confirmation depends on the provider emitting `credentials/record-updated`, and a provider that writes silently makes every attempt end in `NOT_COMMITTED` — deliberately fail-safe; there is no attempt timeout, so a flow that ignores its signal holds its key for the life of the process; and prompts reach only the surface that called `begin()`, with no fan-out to a second page.

The tree is left dirty and uncommitted.
