# Agent Note: Cache the WorkspacePickFlow custom element across renders

Status: implemented

## Problem

`WorkspacePickFlow(props)` always created a fresh `dsh-workspace-pick-flow` element. The flow's auto-open latch (`#autoOpenArmedFor`) lives on that element. `WorkspaceBrowser` composed the factory in its render vdom; `onClose` set `#wsPickerOpen = false` and called `#render()` synchronously.

Each of those re-renders minted a new element, so the latch reset, auto-open fired again, `onClose` ran again, and the microtask loop never yielded. The tab hung. `DshWorkspacePicker` had the same one-shot factory behind a JSX-callable alias, so the empty-state picker could hang the same way.

## Decision

Keep one `dsh-workspace-pick-flow` per owner. `renderWorkspacePickFlow(el, props)` updates `el` in place when it is already the custom element. `WorkspaceBrowser` stores it in `#wsPickFlow`; `DshWorkspacePicker` stores it in `#pickFlow` and diffs `[this.#pickFlow]` rather than a freshly constructed child.

`WorkspacePickFlow(props)` remains the one-shot helper for callers that do not retain the element.

## Alternatives considered

**Drop the auto-open latch.** Rejected: add-only empty workspace lists still need one automatic open; the latch is what makes that an edge trigger.

**Defer `onClose`'s re-render.** Rejected: it would hide the identity bug and leave a flash of a second flow instance.

**Key the factory result in webjsx.** Rejected: the factory returns a real DOM node; a new node every render is still a new custom-element instance with a reset latch. Caching the node is the identity the latch needs.

## Consequences

Closing the add-workspace flow no longer re-enters auto-open. The same cached element receives `open: false` and stays mounted. Callers that still use the one-shot `WorkspacePickFlow` helper recreate the latch on every call; only the two product owners were converted.

## Verification

Live `dsh web` at `http://127.0.0.1:5499` serves the workspace packages under `/vendor/` with `Cache-Control: no-cache`. The browser module for `WorkspaceBrowser.js` contains `renderWorkspacePickFlow(this.#wsPickFlow`. A tab that previously hung on the plus-button close path now completes the render.
