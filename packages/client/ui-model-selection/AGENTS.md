# client-ui-model-selection

## Rationale

- `src/client/service.js`: the composer cannot read this plugin (the dependency runs one way), so the block reason is pushed: only a definite `routable === false` makes the input inert. `null` (before the first load, or after a failed one) must not, or a slow or unreachable Host would lock a working composer.
- `src/client/directory.js` and `src/client/index.js`: load failures on reconnect and menu open are swallowed by design; the failure is recorded on the store and the next menu open is the explicit retry surface.
- `src/client/directory.js` `select`: the Host validates a route before accepting it, so a selection that landed is by construction one it can serve.
- `src/client/index.js`: the `/model` command description is registry-held text: it reads `t()` once at registration and refreshes only on re-registration, not on locale change. Non-slot faces read through the bound translate; the seat component reads the standard seat; the composer-block reason is read at raise time so a locale change reaches the next publish.

## Contracts

- Node half is an empty `apply` (see ui-goal); `invariant.js` is a no-op install (a single command contribution registration).
- Two entries (the `/model` popupSelect and the composer `conversation.input.model` seat) share ONE per-session `ModelDirectory` resolved through `ModelDirectoryResolver` (`ctx.modelDirectories`), so a switch in either entry is what the other shows next. Latest operation wins; an older response never overwrites a newer one; dispose stops late settlements writing the store. Unknown sessions fail loud.
- `refresh` failure keeps the last good groups and current selection. On Host restart the projection is cleared before repull so an unconsumed process-local selection is not shown.
- Popup rows: failure rows are listed but never selectable; row ids are opaque keys resolved by lookup against the loaded groups, never parsed.
- `trigger.selectAria` has the same English text as `trigger.fallback` but stays a separate key: the fallback label and the unset trigger's accessible name may diverge per locale.
- The seat is hidden for addressed subagent sessions (`available` false); `locked` is an owner share supplied by ui-conversation.
