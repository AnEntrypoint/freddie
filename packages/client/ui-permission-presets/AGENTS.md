# client-ui-permission-presets

## Rationale

- `src/client/index.js`: this optional bundle and ui-conversation can load independently, so each owns the same safety copy under its own locale namespace.
- `src/client/index.js`: the picker exists exactly while the settings projection does; a permission-less host serves no key and the bare invocation falls through to the (equally absent) host command.
- `src/client/PermissionRow.js`: the menu and risk-confirmation elements are held across renders via `renderMenu(this.#menu, ...)` / `renderRiskConfirmation(this.#confirmModal, ...)`; the bare one-shot factories create a brand-new `freddie-menu` / `freddie-modal` on every `#render()`, replacing the live element and its listeners or orphaning modals on `document.body`.
- `src/client/PermissionRow.js`: `usePermission` is a hook that ui-renderer's `scoped-slots.js` synthesizes from the slot face's `hooks`; this custom element calls it directly from `#render` as a best-effort bridge because the raw observable is not threaded onto composed props (a ui-slots/ui-renderer gap outside this package).
- `src/client/settings-store.js`: the non-loopback terminal state hides the row exactly like an unserved namespace, because settings RPCs are loopback-only; a held failure with no answer is a failed row, while no failure means the read is still in flight and loading stands.
