# freddie-lazy-require

Caller-relative lazy loading, with success caching, for CommonJS-compatible optional dependencies: a package that depends on something heavy or platform-specific only on first real use (not at module-import time) wraps it in `createLazyRequire` instead of hand-rolling its own `loaded`/cached-value pair.

## Surface

```js
import { createLazyRequire } from '@freddie/freddie-lazy-require'

const loadHeavyThing = createLazyRequire('heavy-optional-dep', import.meta.url)

function useIt() {
  const heavyThing = loadHeavyThing() // requires and caches on first call; every later call returns the same value
  return heavyThing.doSomething()
}
```

`parentURL` (the caller's `import.meta.url`) is what makes resolution caller-relative — the same specifier resolves against whichever package actually calls `createLazyRequire`, not this package's own location. A failed load (missing optional peer dependency, platform mismatch) is not cached, so fixing the installation and calling the loader again retries rather than replaying the original failure forever.

## Model Experience

None; this is a pure module-loading primitive.

#### KV Cache effect

None; nothing here enters a request prefix.

## Known Limitations and Deferred Work

- **No consumer yet.** `packages/session/session-telemetry-otel` and `packages/boot/app-boot/src/profile.js` use `node:module`'s `createRequire` directly today, but for a different purpose (reading a package's own manifest, resolving a package directory) than this primitive's target case (an optional heavy/platform-specific dependency loaded once on first real use). No current freddie package has that exact need; this ships ahead of one, matching the package invariant that an explained empty companion is correct.
