# client-ui-permission-presets

## Rationale

- `src/client/index.js`: this optional bundle and ui-conversation can load independently, so each owns the same safety copy under its own locale namespace.
- `src/client/index.js`: the picker exists exactly while the settings projection does; a permission-less host serves no key and the bare invocation falls through to the (equally absent) host command.
- `src/client/PermissionRow.js`: the menu and risk-confirmation elements are held across renders via `renderMenu(this.#menu, ...)` / `renderRiskConfirmation(this.#confirmModal, ...)`; the bare one-shot factories create a brand-new `freddie-menu` / `freddie-modal` on every `#render()`, replacing the live element and its listeners or orphaning modals on `document.body`.
- `src/client/PermissionRow.js`: `usePermission` is a hook that ui-renderer's `scoped-slots.js` synthesizes from the slot face's `hooks`; this custom element calls it directly from `#render` as a best-effort bridge because the raw observable is not threaded onto composed props (a ui-slots/ui-renderer gap outside this package).
- `src/client/settings-store.js`: the non-loopback terminal state hides the row exactly like an unserved namespace, because settings RPCs are loopback-only; a held failure with no answer is a failed row, while no failure means the read is still in flight and loading stands.

- `src/client/index.js` is a popupSelect decoration on the host `/permission` command: it owns only the bare invocation, while the host command keeps its catalog row, the argued path (`/permission <preset>`) and lifecycle logging. A pick submits the `/permission <preset>` command line, so both surfaces write through one path and the pushed projection frame is the one confirmation. The Full access row carries the same explicit risk gate as the composer chip; the shared popup shell owns the modal mechanics.

- `src/client/settings-store.js` takes the permission descriptor from the shared describe mirror because the dynamic preset enum lives in the namespace schema, which per-namespace scopes do not carry; writes target only `defaultPreset`, carry the descriptor revision and fold their answer back into the mirror. A `select` during a save is ignored (the row control is disabled while saving, so only programmatic double-submits are dropped).

- `src/invariant.js` installs nothing. No runtime invariant: the browser half owns no host events or cross-plugin mutable state; command and slot contribution lifecycles are proven by the HMR-safety spec.
