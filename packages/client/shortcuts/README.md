# @freddie/freddie-client-shortcuts

Window-local keyboard commands: the registry every feature registers its commands into, and the searchable reference that lists what this window offers and rebinds it by action, English alias, or key.

Upstream shipped this as two packages — a `shortcuts` registry and a `ui-shortcuts` browser. They land here as one because neither half is usable alone: a registry with no discovery or rebind surface delivers customized bindings nobody can find or restore, and a reference UI with no registry is an empty list. Splitting them would also fight this repository's own rule that a UI package never imports another package's internals — the browser needs the protocol (normalization, reservation, conflict resolution) and the registry's catalog, so a two-package split would force those symbols into a public export surface that exists only to be consumed by its own sibling.

## Behavior

A command is a feature-owned identity: `id`, `label()`, `aliases`, per-profile `defaults`, the `regions` it claims, the `modals` it answers in, and a `resolve(context)` that returns `handled`, `blocked`, or `pass`. Defaults are declared in physical `code` values (`KeyN`, `Slash`, `Digit1`, `F5`) with a logical `primary` modifier that expands to Meta on macOS and Control elsewhere, so one declaration is correct on every device without a platform switch at the call site. Registration rejects a duplicate id, a default the browser will not deliver, a reserved default, and two defaults that collide on any Web profile — all at registration time, never during a keystroke.

Preferences live in one origin-local document under `freddie.keybindings.v1`, keyed by profile (`web:macos`, `web:windows`, `web:linux`), so a binding set on one device is never applied to another. A read that cannot be trusted — unparsable JSON, an unknown field, a bad profile or command id, a future schema version — is classified as `invalid` or `future`, the defaults stand, and edits are refused. Nothing partially applies.

The effective binding comes from an override, then the owner's default. An explicit override displaces a conflicting default; two explicit overrides that collide are both disabled, and a binding reserved by a fixed input action (a read-only action such as `Send message`) is disabled too. Resolution is order-independent, so registration order never decides which command wins.

Dispatch runs on the bubble phase, so a local control arbitrates before a window command sees the key. The event is consumed when the command handles it and when it blocks it — a combination disabled by a conflict, a command answering outside its modal, or a `blocked` resolution — so a blocked combination does nothing instead of falling through to the browser; auto-repeat is consumed but does not run the command again. An unmatched, abstaining, reserved, or still-loading combination always reaches the browser. Text entry is opt-in: a command claims `page` unless it explicitly asks for `editable` or `terminal`, and Control+W and Control+R inside a terminal stay with the terminal.

Reservation is unconditional for Escape, Tab, Space, Backspace, Delete, and the arrows, and for Enter unless Alt is held; it covers the clipboard and window keys under the primary modifier (C, V, X, Z, Y, Q, H), primary+A without Shift, and the platform-specific Meta and Alt combinations. A combination with no modifier, or with Shift alone, is refused. A binding can therefore never remove the user's only way out of a field or a dialog.

Recording is gesture-scoped. `KeyRecorder` installs capture-phase listeners when a row is armed and removes them on capture, cancellation, blur, or disposal — there is no standing interceptor. The recorded combination lives in one in-memory candidate that is cleared on every stop; it is never written anywhere but the preference document, and never logged. Only the release of the recorded key commits, and a rejected combination is reported as an issue and never reaches preferences. While a gesture is being recorded, propagation stops, so the combination being recorded cannot fire the command it is about to rebind.

Discovery lists editable commands and mounted fixed actions in a stable order — core product actions first, then command-id order within each group — and matches an ordered-subsequence query against the localized label, the English aliases, the keycaps, and the `aria-keyshortcuts` form (with Meta also readable as Cmd). A row appears once however many of its names matched; relevance wins, and equal matches keep display order. Footer shows how many bindings are modified and restores all of them for this device behind a confirmation.

## Extension points

- **`ctx.shortcuts`** — `register(command)` and `registerFixed(command)` (each returning a disposer), `observeFixedInput(listener)`, `describeBinding(binding)` for candidate review, `edit(edit, revision)` for a reviewed change, `openReference()` / `closeReference()` / `search(query)`, and the `catalog`, `config`, `fixedCatalog`, and `reference` (dialog visibility and search text) observables. `platform` and `profile` name the receiving device.
- **`settings.general.item`** — the row that opens the reference, advertising the current `shortcuts.open` combination as its `aria-keyshortcuts`.
- **`shell.overlay`** — the reference dialog itself, naming itself `shortcuts` so a command bound to a modal answers only inside that modal.

This package owns one command, `shortcuts.open` (primary+`/`, so Meta+/ on macOS and Control+/ elsewhere), which runs from the page, text entry, and the terminal, and inside the settings dialog and the reference itself; any other open modal blocks it. Every other command belongs to the feature that implements it. The package's Node face (`.`) registers nothing; everything above is the `./client` half.

## Model Experience

None. Commands here are human input affordances; the package renders no prompt, message, schema, stream, or tool result, and no model-visible surface reads the binding document.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Desktop profiles and two-key chords were not ported.** freddie has no Desktop shell — Electron is excluded from the stack — so `desktop:*` profiles, the `secondCode` chord, and the native window bridge have no surface to run on. A chord is rejected on Web anyway, so keeping the field would be dead code.
- **Web combinations are narrower than native ones.** Only three or more modifiers, a primary Comma/Backslash, Control+Backquote, primary+alt/shift, and the three explicit defaults are advertised; everything else is a combination the browser or the window manager answers before the page sees it. Windows and Linux are treated as one family for this rule (Control is primary in both, and they share a reserved set) rather than narrowing Linux to the three explicit defaults.
- **Overrides are origin-local only.** There is no import/export of a binding set and no host-side synchronization, so clearing site data discards customization.
- **Search is subsequence matching, not fuzzy matching.** A transposed query does not match; that keeps ranking deterministic and cheap enough to run on every keystroke over a catalog of a few hundred rows.
- **Only `shortcuts.open` ships here.** The rest of the command inventory is the owning features' work; until they register, the reference lists this package's own command and any fixed actions mounted by input surfaces.
