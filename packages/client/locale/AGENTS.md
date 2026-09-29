# client-locale

## Rationale

- `apply` (`src/client/index.js`): `ctx.slots.installLocale(locale)` runs before `ctx.provide('locale', locale)`, because `provide` unblocks every plugin declaring `inject: ['locale']`, several of which register entries with `locale: '<ns>'` synchronously; that triggers a `slots/changed` notification that can re-render a mounted outlet reading `host.locale` before the face exists.
- English is the only shipped locale; the registry is a namespaced dictionary store. Lookup chain per key: entry namespace -> `common` -> the key itself (missing text stays visible). Duplicate (ns, locale) registration throws (one owner per namespace). Registration bumps the snapshot revision so mounted outlets pick up late dictionaries. `bind(ns)` returns a stable function per namespace so it survives memoization. `src/index.js` has no host-side behavior; `src/invariant.js` registers no check (no cross-plugin mutable relation).
