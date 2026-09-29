# Agent Note: SDK stdio application profile bundle, and why `sdk-minimal` was not ported

Status: implemented

## Problem

`deepseek-ai/deepseek-harness`'s `packages/bundle/sdk-app` and `packages/bundle/sdk-minimal` were deferred in an earlier pass as "freddie has a different bundling structure." Read against the real source on both sides, that verdict held for `sdk-minimal` and was wrong for `sdk-app`.

`sdk-app` is a patch layer, and the runtime behavior it carries was genuinely missing from freddie. Its `packages/bundle/sdk-app/src/index.ts` is an `sdk-app-startup` plugin with `Config = z.object({ profile: z.string().default('sdk') })`, an `sdkCommand(profile)` commander program, and an action that calls `exitOnStdinEnd(ctx, 'sdk-app.stdin')` before `ctx.provide('sdkAppStartup', { accepted: true })`. Its `cordis.patch.yml` disables `session-title-llm` and `hmr`, restates the `system-prompt` persona, and inserts `[sdk-app-startup (profile: sdk), sdk-jsonrpc-server (inject: [sdkAppStartup, loader], maxTokensAsSuccess env-driven)]` plus `workspace-dependencies` and `skill-office` rows gated on `DSH_PRIMARY_RUNTIME`. Freddie's own server already exists at `packages/sdk/server/src/index.js` (`sdk-jsonrpc-server`, injecting `agents`), and freddie already composes it — but as a complete standalone tree at `examples/jsonrpc-agent/cordis.yml` loaded by an app bin or the Python carrier, not as a `--profile` bundle over `@freddie/freddie-base`. Freddie also had no bounded stdin-EOF exit: `exitOnStdinEnd` had **zero** exhaustive-`codesearch` hits before this pass, and the one EOF binding in the tree (`packages/examples/acp-demo/src/bin.js:31`) is snapshot-mode-gated and calls `process.exit(0)` directly, the bypass `packages/boot/cmdline/src/index.js:144` exists to prevent.

`sdk-minimal` is not a port. Its `src/index.ts` is literally `export {}`, with a comment stating the substance is its `cordis.patch.yml`; that patch is a ~30-row complete standalone tree that explicitly does not layer over `dsh-base`. Freddie already ships exactly that shape at `examples/jsonrpc-agent/minimal.cordis.yml`, loaded by the Python SDK carrier's `minimal.py`.

## Decision

Port `sdk-app` in freddie's idiom, and share the seam the ACP bundle introduced rather than duplicating it.

**The seam.** `exitOnStdinEnd(ctx, label)` at `packages/boot/cmdline/src/index.js:66` binds stdin's `end` to `ctx.appExit(0)`, fails loud when the launcher provided no exit request, requests exit at most once, and detaches its listener through `ctx.effect(fn, label)` on disposal. It is documented in `packages/boot/cmdline/README.md` alongside `parseCmdline`, and this bundle consumes it rather than owning a copy — see the [acp-app note](2026-09-28-bundle-acp-app.md) for why it lives in `@freddie/freddie-cmdline`.

**The bundle — `packages/bundle/sdk-app`.** The same shape as its sibling: `package.json` declaring `"freddie": { "bundle": { "patch": "./cordis.patch.yml" } }`, the patch layer, `src/startup.js` as runtime glue, an empty `src/index.js` entry, and the `src/invariant.js` companion `packages/AGENTS.md:18` requires. Adaptations from upstream:

- `@deepseek-ai/dsh-cmdline` → `@freddie/freddie-cmdline`, `@deepseek-ai/schemastery` → `@freddie/schemastery`, and upstream's `sdk-jsonrpc-server` row → `@freddie/freddie-sdk-jsonrpc-server`; TypeScript `Config` types become JSDoc plus a plain-JavaScript `Schema.object({ profile: Schema.string().default('sdk') })`.
- `SDK_APP_STARTUP_SERVICE = 'sdkAppStartup'` becomes `SDK_STARTUP_SERVICE = 'sdkStartup'` at `packages/bundle/sdk-app/src/startup.js:19`, matching `headlessStartup` (`packages/bundle/headless/src/startup.js:18`) and `webStartup` (`packages/bundle/web-app/src/startup.js:19`); the server row's `inject` follows the name.
- Upstream injects `loader` into the server row. Freddie's server declares `inject = ['agents']` only, so the ported row injects `sdkStartup` alone — adding `loader` would name a service the plugin never declares.
- `DSH_MAX_TOKENS_AS_SUCCESS` becomes `FREDDIE_MAX_TOKENS_AS_SUCCESS`, preserving upstream's mapping: unset or JSON `true` reports a token-limited completion as accepted, JSON `false` reports it as an error. The env name is freddie's own prefix, and the `!!js` expression reads it at row-interpolation time.
- Upstream's `workspace-dependencies` and `skill-office` rows are gated on a runtime-selection env var upstream defines; freddie has no counterpart for either, so they are **not** ported. Porting them would insert rows whose packages do not exist, which is a boot failure rather than a gap closed.
- The command name renders `freddie --profile sdk` because `apps/cli/package.json:15` names the bin `freddie`; the `profile` config exists so a bundle reusing this provider prints its own name.

`packages/boot/app-boot/src/profile.js` gained an `sdk` template (`base` + `sdk-app`), and `apps/cli/package.json:57` gained the bundle dependency.

## Alternatives considered

**Transcribe upstream's row list.** Rejected: freddie's package names differ and rows resolve by package name, so a transcription inserts unresolvable rows. The port is a freddie composition over freddie's real packages.

**Bundle `sdk-minimal` too, as the third package in the audit.** Rejected: it has no runtime code, and its whole content is a non-layering standalone tree freddie already ships at `examples/jsonrpc-agent/minimal.cordis.yml`. A second copy in manifest form would be a duplicate to keep in sync, not a capability.

**Bind EOF inside `@freddie/freddie-sdk-jsonrpc-server`.** Rejected: the server's own documentation leaves EOF and signal exits to the app bin, and a server-owned bind would fire even when the profile was launched for `--help` or from a host that never serves stdio. Keeping it in the startup provider's action keeps it behind the accepted-invocation latch.

**Add `loader` to the server row's `inject` to mirror upstream exactly.** Rejected: freddie's server plugin declares `inject = ['agents']`; injecting a service it does not declare would make the row unresolvable.

## Consequences

Verified live on the real stack:

- `freddie --profile sdk` is alive after a 45s boot window with empty stdout and stderr, and exits **0 within 261ms** of stdin EOF.
- The composed tree dumps 84 rows with `bundles=@freddie/freddie-base, @freddie/freddie-sdk-app`, `hmr` and `session-title-llm` marked `[disabled]`, `sdk-startup` resolving `@freddie/freddie-sdk-app/startup`, and `sdk-jsonrpc-server` resolving `@freddie/freddie-sdk-jsonrpc-server` with `inject=["sdkStartup"]`. A `web` control dump over the same stack shows 144 rows with `hmr` and `session-title-llm` enabled, proving the patch targets only its own profile.
- `pnpm run publint` reports `All good!` for the whole workspace after the manifest changes.

What this buys: an SDK stdio profile whose client disconnect drains the tree through the launcher instead of `process.exit`, a `--profile sdk` template, and one deployment-level flag for token-limited completion. What it costs: two more rows per SDK profile boot, `hmr` and model-generated titles off for that profile, and two upstream rows (`workspace-dependencies`, `skill-office`) deliberately left unported because freddie has no packages behind them.
