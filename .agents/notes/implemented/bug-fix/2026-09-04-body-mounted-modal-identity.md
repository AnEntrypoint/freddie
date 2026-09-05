# Agent Note: Cache body-mounted Modal and TurnStatus across owner renders

Status: implemented

## Problem

`Modal(props)` is `renderModal(null, props)`: it creates a `dsh-modal`, appends it to `document.body`, and returns it. That node is not a child of the caller's vdom. `h(Modal, …)` therefore mounts a **new** body dialog on every owner `#render`.

Two owners did that:

- `DshChatView` rendered `FileOpenErrorDialog` (an `h(Modal)`) whenever `#fileOpenError` was set. ChatView re-renders on stream chunks, so a refused file-open stacked dialogs on `document.body`.
- `DshModelsSectionLoaded` put `h(Modal)` in its section vdom for delete confirmation. `applyDiff` never saw the previous body node, so each re-render while the confirm was open appended another mask.

`TurnStatus()` also called `document.createElement('dsh-turn-status')` on every running-turn render, remounting the elapsed-time clock and resetting its interval.

## Decision

Owners that need a body-mounted dialog hold the element and call `renderModal(el, props)`.

- ChatView stores `#fileOpenModal`, updates it after `applyDiff` when an error is present, and `.remove()`s it when the error clears or the view disconnects.
- ModelsSection stores `#deleteModal` and always `renderModal`s it with `open: this.#deleteTarget !== undefined`, so close is `open: false` on the same node. Disconnect removes it.

ChatView stores `#turnStatus` and reuses that `dsh-turn-status` while the turn is running.

`Modal(props)` remains the one-shot helper.

## Alternatives considered

**Keep `h(Modal)` and teach applyDiff to reuse body-mounted nodes.** Rejected: `renderModal` appends to `document.body`; the returned node is not in the owner's child list, so the parent diff cannot own it.

**Leave the dialog in the owner's vdom without portaling.** Rejected: Modal's contract is to escape ancestor stacking contexts by mounting on `document.body`.

## Consequences

A refused file-open and a Models delete confirm keep one mask. The running-turn clock keeps its interval across ChatView re-renders. Callers that still use `h(Modal)` or `Modal(props)` still leak; only these two product owners were converted.

## Verification

`node --check` on both files. Live plugin serve of ChatView.js and ModelsSection.js contains `renderModal` and no `h(Modal`.
