# AGENTS.md - ui-commands

Rules for this package. The package contract is in [README.md](README.md); the client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

Facts that a name cannot carry; each bullet names the file and symbol it belongs to.

- `agent-preset/selected` handler (`service.js`): a preset switch changes which commands one session's agent resolves but registers nothing globally, so `commands/change` never fires; the handler repulls that session's key alone, and `refresh` (`directory.js`) does not demote a ready snapshot, so the old menu serves until the new one lands.
- `dispatch`, `matchEnter` (`service.js`): a decoration replaces a HOST row's bare invocation with its popup. It only applies to a command that already resolves in the host directory, never creates one, and an argued line never consults it (the claim and detached paths own that).
- `execute` (`service.js`): an image-carrying submission consumes its images only on handler success; an error outcome is returned as `error` so the composer keeps the draft and images.
- `settle` (`popup.js`): a select result that lands after the popup was dismissed, reopened or disposed (the `binding` no longer matches) writes no state and consumes no trigger span.
- `#confirmModal` (`PopupSelectView.js`): held across renders and updated through `renderRiskConfirmation`; the bare one-shot helper appends a brand-new freddie-modal to `document.body` on every render and orphans the previous one.
- `onKeyDown` and the row `onclick` (`PopupSelectView.js`): ArrowLeft/ArrowRight are left unhandled so the search input keeps native caret movement; rows select on `click`, not `mousedown`, which would race the capture-phase outside-pointer dismiss listener. Focus stays in the search input while arrows move a virtual highlight, so the active row is scrolled into view by hand.

## CSS rationale

- `PopupSelectView.css`: rows truncate instead of pushing the card past the composer's edge (max-width is the overlay anchor's width); the 320px height cap is clamped at runtime to the space above the composer through the inline `max-height` that `PopupSelectView.js` sets.
