# Agent Note: computer-use provider registry

Status: implemented

## Problem

dsh's `packages/computer-use/computer-use` was deferred as "the desktop-GUI analogue of browser-use, which needs a desktop framework." Proving or overturning that against real upstream source was this task, under a hard no-stack-change rule (Node/pnpm/Cordis only; Electron and every desktop application framework excluded outright).

## Decision

**Portable — shipped as a registry, exactly as browser-use was.** The upstream package is not a desktop driver; it is the exclusive registration seam the driver registers against. Full source read from `raw.githubusercontent.com/deepseek-ai/deepseek-harness/master`:

- `package.json` — `@deepseek-ai/dsh-computer-use`, description "Exclusive named computer-use provider registration". Its only dependencies are `@deepseek-ai/cordis` and `@deepseek-ai/dsh-brand`: **no desktop framework, no native module, no vendor binding.**
- `src/index.ts` (63 lines with `brand.ts`) — imports only `@deepseek-ai/cordis` and the brand type; `ComputerUseRegistry extends Service`, `super(ctx, 'computerUse')`, one private `registration`, a `providerName` getter, and `register(name)` that throws `computer use provider "<name>" is already registered` or returns a `ctx.effect()` disposer. No driver object, no operation interface, no platform code.
- `src/brand.ts` — `ComputerUseProviderName(name)`, an identity cast over `Branded<'ComputerUseProviderName'>`.
- `packages/computer-use/README.md` (group contract) — "This group owns exclusive provider registration. Each provider owns its operations, tools, and **platform requirements**; the experimental Cua Driver providers live in the experimental group." The desktop requirement lives in the *provider*, not in the package ported here.

The desktop-framework theory is therefore wrong at the package level: the platform requirement is a property of `experimental/computer-use-cua-driver-*`, which was not in scope and would be a genuine verified negative on its own.

## Port

New package `packages/computer-use/computer-use` (`@freddie/freddie-computer-use`), a direct, unmodified-logic port modelled on `@freddie/freddie-browser-use`:

- `src/brand.js` — `ComputerUseProviderName(name)`, a plain identity function (freddie's convention for a cross-package id brand with zero runtime representation, replacing dsh's `Branded<>` type).
- `src/index.js` — `ComputerUseRegistry extends Service`, registering `ctx.computerUse`, `register()` returning the `ctx.effect()` disposer.
- New group `packages/computer-use/README.md`; one row added to `packages/README.md` (74 lines, cap 1060).

No adaptation beyond brand-type erasure. `ctx.effect()`'s idempotent disposer is a core `@freddie/cordis` guarantee (framework/cordis/src/fiber.js:202 instantiates constructor plugins via `new callback(ctx, config)`, so `ctx.plugin(ComputerUseRegistry)` mounts the service).

## Alternatives considered

**Also porting a Cua Driver provider.** Rejected: both live in dsh's `experimental/` group, each is its own substantial desktop-automation surface, and freddie's stack carries no desktop application framework — under the user's no-stack-change rule that is a verified negative, not a port. **Declaring a non-port** was the alternative the decision gate offered; rejected because the gate's own conditions (inseparable from a desktop framework / vendor binding / no runtime behavior) are all falsified by the source above.

## Consequences

Verified live against a real `@freddie/cordis` `Context` (not a stub), mounting the shipped source through real package resolution. Transcribing dsh's registry assertions, observed output:

```
PASS ctx.computerUse is the registry -> true
INFO consumer saw: ComputerUseRegistry same=false protoOf=false
INFO register via consumer -> root.providerName=cross consumer.providerName=cross
INFO second consumer reads providerName=cross
PASS initial providerName -> undefined
PASS after register alpha -> alpha
PASS duplicate rejection -> computer use provider "alpha" is already registered
PASS after dispose alpha -> undefined
PASS re-register after release -> beta
PASS stale disposer keeps new registration -> beta
PASS slot free again -> undefined
PASS plugin-scoped registration -> gamma
PASS released when owner plugin unloads -> undefined
```

The two `INFO` lines are cross-consumer identity probes: `ctx.computerUse` reached from a plugin declaring `inject = ['computerUse']` is a distinct Cordis wrapper object (`same=false`), not a copy — a registration made through it is visible from the root context and from a second consumer (`providerName=cross` in both), so one slot really is shared. `pnpm run publint`: `packages\computer-use\computer-use` → `All good!`, 252/255 packages clean; the 3 failures (`packages\api\job-controller`, `packages\boot\config-editor`, `packages\llm\llm-pi-ai`) are pre-existing and untouched by this change — job-controller and llm-pi-ai fail on manifest paths to files absent from their own source trees, and config-editor failed in one run and not the next under another session's concurrent edits.

Ships without any computer-use provider — `ctx.computerUse` exists and is fully correct, but nothing registers against it yet.
