# client-locale

## Rationale

- `apply` (`src/client/index.js`): `ctx.slots.installLocale(locale)` runs before `ctx.provide('locale', locale)`, because `provide` unblocks every plugin declaring `inject: ['locale']`, several of which register entries with `locale: '<ns>'` synchronously; that triggers a `slots/changed` notification that can re-render a mounted outlet reading `host.locale` before the face exists.
