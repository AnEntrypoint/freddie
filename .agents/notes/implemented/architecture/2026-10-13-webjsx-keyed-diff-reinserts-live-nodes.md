# Agent Note: webjsx keyed diff re-inserts live DOM nodes on every render

Status: implemented

## Problem

`FreddieTurnStatus` (`packages/client/ui-conversation/src/client/chat/ChatView.js`, the `freddie-turn-status` element) is a long-lived element that ChatView places among keyed chat seats. Its `connectedCallback` starts a 1 s clock interval and its `disconnectedCallback` clears it, so every detach and reattach restarts the clock. Measured on `?fixture` with `startReasoningChunkStorm('fx-alpha', 1000, 1, 16)`: 7 removes and 7 inserts of the status element in the first 15 s, all under `DIV.freddie-chatView__column`, one pair per ChatView render.

## Cause

`framework/webjsx/src/applyDiff.js` `diffChildren` switches to keyed mode as soon as one child carries a key. In keyed mode an unkeyed child that is already a DOM `Node` takes the `create` path. `applyChanges` then ran `parent.insertBefore(node, lastPlacedNode.nextSibling)` unconditionally. A DOM `insertBefore` removes the node first even when it lands at the same position, so a node already in place still fired `disconnectedCallback` and `connectedCallback`.

## Decision

A `Node` vnode that already sits at its target position is kept as-is: `isInPlace` compares the node with `lastPlacedNode.nextSibling` (or `parent.firstChild` when nothing is placed yet). Only a node that is actually out of place is moved. Order and placement are unchanged; only the no-op move is skipped.

## Consequences

Live witness after the change, same probe: 2 removes and 2 inserts in the storm window, both at real reorders when a new assistant step seat was placed ahead of the status element. The status still reads `Deep diving...` with its clock ticking. Console errors stay at the same set as before the change (four: the cordis inspect sync failure and three inventory reads), so nothing new appeared.

The remaining two moves are genuine placement changes: a new seat inserted before the status forces it to move. Avoiding those would need a different placement strategy and is not pursued here.

## Alternatives considered

- Keying the status element inside ChatView: would stabilise identity but change the list shape for every consumer and still leave the same reorder moves; rejected because the churn is a webjsx no-op move, not a ChatView identity bug.
- Moving the status element out of the keyed list into a fixed slot: changes visible placement and the status line's contract; rejected.
