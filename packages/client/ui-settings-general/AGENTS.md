# client-ui-settings-general

## Rationale

- `src/client/index.js` nav projection: the ledger-to-nav-row source follows the subscribe/`getSnapshot` external-store contract (`getSnapshot` returns the cached rows until the ledger version moves). Labels may be locale-following thunks, so the cache key includes the locale revision and subscribers ride both sources.
- `src/client/index.js` shell registration: the `webjsxSlot()` stub cannot structurally prove it consumes `renderSlot` the way `RendersCheck` wants (dispatch happens inside the registered custom element, off ui-slots' type-erased `entry.component` boundary, same cast as `ui-layout/src/client/index.js`). Runtime dispatch is unaffected; the cast only satisfies the compile-time shape check.
- `src/client/SettingsRoot.js`: `aria-modal="true"` declares the panel traps focus, so Tab is trapped explicitly; without it Tab escaped to the page behind the mask (same fix class as `Modal.js` `#trapTab`).
- `src/client/SettingsRoot.js` `#isTopmostModal`: the Escape and Tab handlers are document-level, so a dialog opened over Settings (the shortcut reference via `Mod+/`, appended to `document.body`) would otherwise be closed together with Settings by one Escape and would lose Tab focus to the panel behind it; Settings acts only while it is the last `[role="dialog"][aria-modal="true"]` in document order.

## CSS rationale

- `SettingsRoot.css` `.panel`: one height for every section, taken from the viewport rather than the content, because sections differ by hundreds of pixels and a content-sized panel would resize under the pointer on every nav click; whatever does not fit scrolls in `.options`. `chrome.css`: the slot outlet's wrapper sits between the shell's flex button and the registrant's content with no gap of its own, so the icon/label pair is laid out inside the content; the label only guards against overflow during the sidebar collapse crossfade. `GeneralSection.css`: feature-contributed rows own their chrome and separators, so the section strips the trailing separator wherever the column ends.
- `src/client/SettingsRoot.js` document keydown handler: acts only while `isTopmostModal` (ui-primitives) holds for its dialog, so a dialog stacked above Settings (the shortcut reference, a confirmation) owns Escape and Tab alone; without the check Escape closed both and the Tab trap pulled focus out from behind the dialog above.

- Shell plus ownerless copy: registers trigger/header/close chrome content, the local-document header action, the General section, and `settings` dictionaries. Feature-owned rows and sections stay with their features. Target slots are declared by ui-settings' apply, whose activation order is not constrained, so registrations wait on `slots.inject()`.
- `SettingsRoot`: pure composition face; open state, active section id, and onboarding progress are element-local. The onboarding coordinator mounts exactly one ordered registrant while the sessions-derived empty-Hero fact is active; visible dialog chrome belongs to the step. Nav glyph is chosen by section id, unknown ids fall back to the settings gear. Escape-key and initial-focus bookkeeping are tied to open/close transitions in connectedCallback/disconnectedCallback.
- Slot list entries always carry `options.id` (SlotCore rejects an entry without one), so the `?? ''` fallbacks in `index.js` are unreachable and v8-ignored.
- `settings-document-store.js`: local-document availability derives from the shared mirror's `hasDocument`; concurrent open gestures collapse behind the in-flight action.
- `invariant.js`: no runtime invariant; the settings seam validates the durable onboarding section and slot conflicts fail loud in the slot core.
