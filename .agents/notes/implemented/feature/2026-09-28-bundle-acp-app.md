# Agent Note: ACP stdio application profile bundle, and the stdin-EOF exit seam it needs

Status: implemented

## Problem

`deepseek-ai/deepseek-harness`'s `packages/bundle/acp-app` was deferred in an earlier pass as "freddie has a different bundling structure." Read against the real source on both sides, that deferral was half right.

The composition form was genuinely absent, and for a reason that is a deliberate freddie choice rather than an oversight: upstream's `packages/bundle/acp-app/cordis.patch.yml` is a patch list over its own `dsh-base` rows — it disables `session-title-llm` and `hmr`, restates `system-prompt`'s persona, and inserts `[acp-app-startup, acp (inject: [acpAppStartup], provider deepseek-official, model deepseek-v4-flash)]`. Its `src/index.ts` is an `acp-app-startup` plugin that injects `cmdlineArgs`, parses a zero-option `dsh --profile acp` commander program, and in the action calls `exitOnStdinEnd(ctx, 'acp-app.stdin')` before `ctx.provide('acpAppStartup', { accepted: true })`. Freddie's equivalent capability was real but lived somewhere else: the startup-latch idiom already exists at `packages/bundle/headless/src/startup.js:18-48` (`headless-startup` injects `cmdlineArgs`, parses a program, provides `headlessStartup` from the action, and `headless-runner` injects it), and ACP stdio composition exists as a complete standalone tree at `examples/acp-agent/cordis.yml` driven by an app bin — not as a `--profile` bundle over `@freddie/freddie-base`.

The runtime behavior all three of these bundles carry was a genuine gap, and the deferral was wrong about it. `exitOnStdinEnd` had **zero** exhaustive-`codesearch` hits in freddie. Freddie's only stdin-EOF binding is `packages/examples/acp-demo/src/bin.js:31`, which is gated to snapshot mode and calls `process.exit(0)` directly — the exact bypass `packages/boot/cmdline/src/index.js:144` exists to prevent, since a direct exit skips the launcher's drain of persistence, telemetry, and every other disposal.

## Decision

Port the seam and the bundle that owns it, each in freddie's own idiom.

**The seam — `packages/boot/cmdline/src/index.js:66`.** `exitOnStdinEnd(ctx, label)` binds stdin's `end` to `ctx.appExit(0)`: it reads the exit request through `ctx.get('appExit')`, fails loud at bind time when the launcher provided none, requests exit at most once, and removes its listener through `ctx.effect(fn, label)` so the owning scope's disposal detaches it. A `stdio` object holds the watched stream, so a driver can point it somewhere other than the process's own stdin without touching production behavior. It joins `provideCmdline`'s existing contract rather than adding a new one — a stdio app's client disconnect is a successful disconnect, not a failure, so the request carries code 0.

**The bundle — `packages/bundle/acp-app`.** A freddie bundle in freddie's shape: `package.json` declares `"freddie": { "bundle": { "patch": "./cordis.patch.yml" } }`, `cordis.patch.yml` is the patch layer, `src/startup.js` is the runtime glue, `src/index.js` is the empty entry, and `src/invariant.js` is the invariant companion `packages/AGENTS.md:18` requires. Adaptations from upstream, all forced by freddie's rules or by names freddie does not share:

- `@deepseek-ai/dsh-acp` → `@freddie/freddie-acp`, `@deepseek-ai/dsh-cmdline` → `@freddie/freddie-cmdline`, `@deepseek-ai/schemastery` → `@freddie/schemastery`; TypeScript `export type Config` / `export const Config: z<Config>` become JSDoc plus plain-JavaScript `Schema`, with no build step and no `lib/`.
- Upstream's `ACP_APP_STARTUP_SERVICE = 'acpAppStartup'` becomes `ACP_STARTUP_SERVICE = 'acpStartup'`, matching freddie's `headlessStartup` / `webStartup` service naming at `packages/bundle/headless/src/startup.js:18` and `packages/bundle/web-app/src/startup.js:19`. The bridge row's `inject` follows the name.
- Upstream's `personaPrefix` / `personaSuffix` split is one `system-prompt` `persona` block, matching `packages/bundle/headless/cordis.patch.yml`'s existing persona patch.
- Upstream's disabled `session-title-llm` id targets freddie's own row id, which `packages/bundle/base/cordis.patch.yml:46` spells `session-title-llm` while mounting `@freddie/freddie-session-title-first-prompt-llm`; the patch disables by id, so the id is what had to match, not the package.
- The persona text, zero-option command, `provider: deepseek-official`, and `model: deepseek-v4-flash` are carried over as shipped defaults because they are upstream's real values; the row is a patch target, so a deployment replaces them through a later layer.

`packages/boot/app-boot/src/profile.js` gained an `acp` template (`base` + `acp-app`), and `apps/cli/package.json` gained the bundle dependency, so `freddie --profile acp` initializes and resolves it.

**Not ported: `packages/bundle/sdk-minimal`.** Its `src/index.ts` is literally `export {}`, with a comment stating the substance is its `cordis.patch.yml`; that patch is a ~30-row complete standalone tree that explicitly does not layer over `dsh-base`. Freddie already ships that shape at `examples/jsonrpc-agent/minimal.cordis.yml`, which the Python SDK carrier loads through `minimal.py`. Porting it would duplicate a tree freddie already owns, in a manifest form freddie does not use for it.

## Alternatives considered

**Transcribe upstream's plugin list row-for-row.** Rejected: freddie's package names differ and patch rows are resolved by package name, so a transcription would insert rows that cannot resolve. The right port is a freddie composition assembling freddie's real packages.

**Put `exitOnStdinEnd` in each bundle's startup plugin instead of `@freddie/freddie-cmdline`.** Rejected: it is a launcher-contract operation — it reads `ctx.appExit` and fails loud without it — and the package that provides `parseCmdline` and documents the launcher values is where that contract lives. Duplicating the listener-once and disposal bookkeeping across bundles would give each bundle its own chance to get the drain wrong.

**Bind EOF unconditionally at plugin load rather than inside the commander action.** Rejected: `--help` exits through commander without running the action, and an unconditional bind would leave a listener attached to a stream the help path never claimed and exit the process on an EOF that arrived during help. Binding from the action puts it behind the same accepted-invocation latch as the transport.

**Extend `packages/examples/acp-demo/src/bin.js` instead of adding the seam.** Rejected: that binding is snapshot-mode-gated and calls `process.exit`, which is the bypass the seam exists to remove; it is an example bin, not a launcher contract.

**Mount the bundle's rows in `packages/bundle/base/cordis.patch.yml`.** Rejected: base is every profile's first layer. Putting an ACP transport there would claim stdin for web and headless launches.

## Consequences

Verified live on the real stack, not through a hand-built context:

- `freddie --profile acp --help` exits 0 with `Usage: freddie --profile acp [options]` / `Serve automation clients over Agent Client Protocol stdio.` / `Options:` / `  -h, --help  show this help` / `Example:` / `  freddie --profile acp     serve ACP until the client disconnects`, and empty stderr — so help writes and exits with no transport started and no stdin claimed.
- `freddie --profile acp` is alive after a 45s boot window with empty stdout and stderr, and exits **0 within 264ms** of stdin EOF.
- The composed tree dumps 84 rows with `bundles=@freddie/freddie-base, @freddie/freddie-acp-app`, `hmr` and `session-title-llm` marked `[disabled]`, `acp-startup` resolving `@freddie/freddie-acp-app/startup`, and `acp` resolving `@freddie/freddie-acp` with `inject=["acpStartup"]`. A `web` control dump over the same stack shows 144 rows with `hmr` and `session-title-llm` enabled, which is the proof the new patch targets only its own profile.
- `pnpm run publint` reports `All good!` for the whole workspace after the manifest changes.

What this buys: an ACP stdio profile that terminates through the launcher's bounded shutdown instead of `process.exit`, so a client disconnect drains persistence and telemetry; `--help` that can never leave a listener behind; and a profile template that makes `freddie --profile acp` a first-class launch. What it costs: two more rows per ACP profile boot, `hmr` and model-generated titles off for that profile, and one more package whose invariant companion registers an empty installer.
