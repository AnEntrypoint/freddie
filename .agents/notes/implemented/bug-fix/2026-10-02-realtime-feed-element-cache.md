# Agent Note: Realtime feed element cache

Status: implemented

## Problem

The Web conversation feed stops painting while a turn is running. Clicking away and back, or refreshing, shows the work that arrived. The assembler rebuilds the assistant node object on every chunk. `AssistantMarkdown` cached its rendered blocks in a `WeakMap` keyed by that object, so every chunk missed, minted a second element, and asked `applyDiff` to replace the detached one. `replaceChild` threw, the chat render aborted, and the last successful DOM stayed on screen. The running-turn clock kept ticking because it renders on its own timer.

## Decision

`AssistantMarkdown` caches each rendered block by the stable node key plus the block index in a module `Map`. `AssistantNodeView` passes `node.key`, which the assembler guarantees, instead of the rebuilt node object. A later chunk updates the existing element.

`applyDiff` still replaces a raw DOM child whose parent is the live parent. When that child is detached, it inserts the new child at the new position instead of calling `replaceChild`. One aborted diff no longer stops every later render of that parent.

## Alternatives considered

**Key the `WeakMap` by a stable object the assembler retains.** The view builder returns a fresh node and does not retain one. The stable identity it already publishes is the string key.

**Ignore `instanceof Node` in `applyDiff`.** Callers return cached elements on purpose (`renderMarkdownText`, `renderTooltip`, `renderJsonBlock`). Treating every raw node as a vnode would recreate those elements and drop their state.

**Clear the child list and append.** A child that is already in the live parent must stay in place. Replacing only when the parent matches, and inserting only when it does not, keeps the update-in-place path.

## Consequences

A running transcript keeps painting new assistant text without a remount. A cache miss still creates an element, but a detached previous child no longer aborts the render. The module `Map` retains an element for every key and index rendered in the page lifetime; a `WeakMap` cannot, because the key is a string. Opening a session that already existed at mux connect still has no `session/subscribed` baseline. History open and gap repair cover that gap; it is not what froze the DOM.
