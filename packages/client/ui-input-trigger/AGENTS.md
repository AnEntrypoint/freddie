# client-ui-input-trigger

## Rationale

- `FreddieMenuView#render` (`src/client/MenuView.js`): focus stays in the composer textarea (combobox pattern). Options therefore act on `mousedown` with `preventDefault` (a click would follow a focus steal and a blur-driven teardown), and the highlighted option is scrolled into view by hand because the browser never scrolls it on keyboard moves.
- `FreddieMenuView#anchored` (`src/client/MenuView.js`): the `createAnchoredMaxHeight` controller must be created once and reused across renders. Its `fit()` compares against an internal baseline that starts at the design cap; recreating it per `#render()` makes the first `fit()` always report a change, `onChange` re-renders, and the loop never ends (crashed as "Maximum call stack size exceeded" in `applyDiff`).
- `#refreshLexicon` (`src/client/controller.js`) and `registerSource` (`src/client/service.js`) catch a faulty source callback (`lexicon`; `warm` and `subscribeLexicon` via `sourceAdded`) and log it with `console.error`: both run inside notification or registration paths where a throw would starve the remaining consumers, and a registration must still return its disposer.

## CSS rationale

- `MenuView.css`: the 537px cap is the design width and the `100%` clamp keeps the menu inside the composer card on narrow viewports (the overlay anchor is exactly the card's width); the 320px height cap is clamped at runtime to the space above the composer through the inline `max-height` that `MenuView.js` sets.
