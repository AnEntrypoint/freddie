# client-ui-input-trigger

## Rationale

- `FreddieMenuView#render` (`src/client/MenuView.js`): focus stays in the composer textarea (combobox pattern). Options therefore act on `mousedown` with `preventDefault` (a click would follow a focus steal and a blur-driven teardown), and the highlighted option is scrolled into view by hand because the browser never scrolls it on keyboard moves.
- `FreddieMenuView#anchored` (`src/client/MenuView.js`): the `createAnchoredMaxHeight` controller must be created once and reused across renders. Its `fit()` compares against an internal baseline that starts at the design cap; recreating it per `#render()` makes the first `fit()` always report a change, `onChange` re-renders, and the loop never ends (crashed as "Maximum call stack size exceeded" in `applyDiff`).
- `#refreshLexicon` (`src/client/controller.js`) and `registerSource` (`src/client/service.js`) catch a faulty source callback (`lexicon`; `warm` and `subscribeLexicon` via `sourceAdded`) and log it with `console.error`: both run inside notification or registration paths where a throw would starve the remaining consumers, and a registration must still return its disposer.

## CSS rationale

- `MenuView.css`: the 537px cap is the design width and the `100%` clamp keeps the menu inside the composer card on narrow viewports (the overlay anchor is exactly the card's width); the 320px height cap is clamped at runtime to the space above the composer through the inline `max-height` that `MenuView.js` sets.

## Contracts

- Node half is an empty `apply` (see ui-goal); browser half via `exports["./client"]`. `invariant.js` is a no-op install: the pipeline is a pure core (detect/menu reduce) plus a registry, no cordis events.
- `InputTriggerService` (`ctx.inputTriggers`) holds only the stateless source registry and the per-session controller map; sources call `registerSource` alone, the conversation wiring layer resolves the controller through `sessionOf`. All mutable state (hit, menu store, fetch lifecycle) lives on `InputTriggerController`. Sources are unique by (trigger, name); duplicates throw.
- The controller's hit is the authoritative span (with `draftRev` for pick-time CAS) and outlives menu close for space adjudication. Sources registered after scope birth are warmed and folded into the lexicon on notification; the constructor prewarm only covers the roster present at birth.
- Trigger guard tiers: `plain` both `@` and `/` live, `claimed` suppresses `/`, `frozen` suppresses both. A trigger char opens only at draft start, after whitespace or after punctuation; `/` stays dead inside URLs (after `:` following a non-space char, and directly after another `/`).
- Menu reducer: one group per source, generation-gated settlement (stale events dropped), empty ready groups auto-close, `source-failed` silently removes the group, stale or no-op events return the same state reference. The `hit` event carries no roster, so the shell seeds pending groups before dispatching it.
- `conversation.input.overlay` is owned by the ui-conversation composer entry; the SlotMap type merge lives with this package because the dependency direction admits no reverse import.
- Prompt serialization of a reference goes through the owning source's codec; a missing owner or codec rejects so the submit blocks instead of downgrading to clipboard text. Enter adjudication polls `matchEnter` in registration order, first non-undefined wins.
