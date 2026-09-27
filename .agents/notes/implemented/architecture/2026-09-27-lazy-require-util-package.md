# Agent Note: `util/lazy-require`, ported from dsh

Status: implemented

## Problem

Continuing the `deepseek-ai/deepseek-harness` comparison ([values](2026-09-27-shared-values-util-package.md), [time/crypto/chunked-list](2026-09-27-time-crypto-chunked-list-util-packages.md)): dsh's `util/lazy-require` (caller-relative `require` with success-only caching, for an optional CommonJS-compatible dependency loaded on first real use rather than at import time) had no freddie counterpart. `util/package-manifest`, the other remaining small `util/*` package from the comparison, is pure TypeScript interface documentation with zero runtime exports (the manifest shape of a package.json's `freddie`/`dsh` fields) — like `util/brand`, it is dropped entirely by the buildless JS conversion and is not a real gap to port.

## Decision

New zero-dependency package `packages/util/lazy-require` (`@freddie/freddie-lazy-require`), exporting `createLazyRequire(specifier, parentURL)`.

## Alternatives considered

**Port `util/package-manifest` too, for completeness against the upstream package list.** Rejected: it has no runtime code in the source project either (`export type { ... } from './types.ts'`), and freddie's buildless conversion already established (`util/brand`) that a TypeScript-only package becomes nothing at runtime — porting it would produce an empty package serving no purpose beyond matching a name in a list.

## Consequences

Verified live: a real `createLazyRequire('node:path', import.meta.url)()` call resolves the module and returns the identical cached value on a second call. `pnpm run publint` passes (228/228). No current freddie package has the exact target need (an optional heavy/platform-specific CJS dependency loaded once on first use) — `session-telemetry-otel` and `boot/app-boot/profile.js` use `node:module`'s `createRequire` directly, but for reading a package's own manifest and resolving a package directory, not this pattern — so this ships with no consumer yet, per the package invariant that an explained empty companion is correct.
