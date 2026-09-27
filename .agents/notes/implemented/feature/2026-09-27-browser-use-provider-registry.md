# Agent Note: browser-use provider registry

Status: implemented

## Problem

dsh's `@deepseek-ai/dsh-browser-use` is a small, real, verified-against-source package (`src/index.ts`, `src/brand.ts`, 63 lines total) that owns exclusive named registration for a browser-use capability: exactly one provider may hold `ctx.browserUse` at a time. Freddie has `@freddie/freddie-web-search-browser` (a browser-backed *search* provider) but no equivalent exclusivity seam for general browser-use automation, and no `ctx.browserUse` key at all.

## Decision

New package `packages/browser-use/browser-use` (`@freddie/freddie-browser-use`), a direct, unmodified-logic port:

- `brand.js` — `BrowserUseProviderName(name)`, a plain identity-cast function (freddie's established convention for a cross-package id brand with zero runtime representation, replacing dsh's `Branded<'BrowserUseProviderName'>` type).
- `index.js` — `BrowserUseRegistry extends Service` (registers as `ctx.browserUse`), holding at most one `registration` name. `register(name)` throws (naming the current holder) if a slot is already taken, otherwise returns a `ctx.effect()` disposer that clears the slot on disposal.

No adaptation was needed beyond the brand-type erasure — `ctx.effect()`'s idempotent-disposer contract (calling an already-fired disposer again is a no-op, verified explicitly by dsh's own test: disposing a stale registration after a *different* provider has since taken the slot must not clear that new registration) is a core Cordis guarantee freddie's `@freddie/cordis` already provides identically.

## Alternatives considered

**Also porting a driver implementation (Playwright MCP, Chrome DevTools MCP, or a native Stagehand-style backend) to give this seam an actual consumer.** Rejected for this change: each driver in dsh's `experimental/` group is its own substantial automation surface (a full MCP client integration or native browser-control library) deserving independent review, and this session's own established exclusion criteria already treat ad hoc browser automation as adequately covered by the deployment's `gm` tooling. Shipping the seam alone matches the pattern already used for `mcp-resources` (shared tools shipped before `mcp-client` wires a resources provider into them).

## Consequences

Verified live against a real `@freddie/cordis` `Context` (not a stub), transcribing dsh's own `registry.spec.ts` assertions into a throwaway script: initial `undefined` state, successful registration, a second registration attempt throwing and naming the current holder, disposal freeing the slot, re-registration after disposal, and the idempotent-stale-disposer edge case (disposing an old registration after a new one has already taken the slot leaves the new one intact) — all passed. Also verified a plugin-scoped registration releases automatically when its owning plugin unloads. `pnpm run publint`: 240/240 clean. CLI headless boot regression-checked cleanly.

Ships without any browser-use driver/provider — `ctx.browserUse` exists and is fully correct, but nothing registers against it yet.
