# Agent Note: pure chat node views subscribe to reads; session rows are contained

Status: implemented

## Problem

- The chat node views for compaction, model-retry, turn-error, turn-max-tokens and unknown were registered as plain functions. The default `'all'` subscription re-rendered each of them on every streamed token, although each one reads only its `node` and `t` props.
- Session rows (`.freddie-rows__sessionRow`) are laid out and painted even when offscreen, so a long session list costs layout on every mount and update.

## Decision

- Each of the five views is registered with `functionSlot(view, { subscriptions: 'reads' })`, matching `UserMessageNodeView` and `ContextMessageNodeView`. A view that reads no hooks never re-renders from session notifications; it re-renders only when its owner props change.
- Session rows that are not drop targets get `content-visibility: auto` with `contain-intrinsic-size: 32px`, the rows' fixed height. Drop-target rows are excluded because their `::before`/`::after` indicators sit outside the row box (`top: -7px`), which paint containment would clip. Focus outlines use `outline-offset: -2px` so the focus ring stays inside the containment box.
- The portaled row menu is unaffected by containment.

## Verification

- Synthetic rows bench (`rows-bench.mjs` with the variant applying `content-visibility`): mount of a 500-row list 27.3 ms to 9.6 ms; 3000 rows 168.7 ms to 63.5 ms.
- Streaming bench (400 messages, 200 tokens at 16 ms): `newestUserVisible` is true; script 5.46 ms per token and task 10.9 ms per token (previously 6.5 to 7.3 and 14.3 to 15.2, within noise but consistent); chat inclusive about 0.79 ms per token (previously about 1.0). Errors are the fixture's unavailable RPC endpoints only.
- Drag bench: no errors; per-move script 0.73 ms, layout 0.77 ms; the store probe is unchanged from the control (see the locale-face note).

## Open

- The drag hover calls `#render()` on each move, so the whole session list is re-diffed on every move (O(N) in session count). Content-visibility reduces layout, not the diff. Virtualizing the flat list is the remaining fix.
