# Agent Note: empty slot outlets skip the session-hook subscription

Status: implemented

## Problem

`freddie-slot-outlet` decides its hook subscriptions in `#renderContent`. `readsOnly` was true only when there was at least one participant and every participant declared `'reads'`. An outlet with zero participants therefore fell to the default: it subscribed to every session hook, and re-rendered on every streamed token even though it had no content.

Measured per streamed token (`stream-bench`, `DIAG=1 MSGS=400 TOKENS=200 INTERVAL=16`, counting real `#renderContent` calls, not `setProps`):

- `conversation.input.left` 0.95, `conversation.input.right` 0.95, both with no registrant.

## Decision

`readsOnly` is `[...participants].every(...)`. An empty participant set is vacuously `'reads'`, so the outlet tracks only what its render read. Registrant changes still reach the outlet through its per-slot version subscription (`bindVersion` → `host.subscribe(key)`): the registry marks a record dirty on register, and `flush` notifies that record's listeners.

## Verification

Live, `stream-bench` on the committed tree:

- `conversation.input.left` and `conversation.input.right` drop below 0.03 per token and leave the per-token list.
- `shape.newestUserVisible` true. Errors are the three fixture RPC errors only.
- Inclusive outlets 1.13 to 1.03 ms per token. Task 6.40 to 6.34 ms per token. The chat and task numbers move with run-to-run noise.
- `drag-bench`: sidebar 280px to 420px, store check passes, conversation head unchanged, errors empty.

Not witnessed: a registrant added to an empty outlet at runtime. No registrant exists for `conversation.input.left` or `right` in the repo, so that path has no live case here. It relies on the registry notification described above.

## Corrections to earlier notes

`2026-10-13-details-and-composer-dock-value-reads.md` reported `conversation.input.overlay`, `conversation.input.left` and `conversation.input.right` at 0.01 per token. That was a count of `setProps` calls, which return early when owner props are unchanged. Counting real renders, `conversation.input.overlay` is 0.95 per token, and `left`/`right` were also 0.95 before this change.

`conversation.input.dock` and `conversation.composer.bar` were called 0.94 times per token by `setProps`, but render 0.01 times per token. Their calls are skips, not re-renders.

## Open items

- `conversation.input.overlay` (0.94 per token) and `conversation.composer` (0.94 per token) still re-render. Their renders read session hooks through tracked reads (the composer `select` predicates and entry injection). `observableHook` bumps its revision on every source notify and ignores the equality argument, so a `'reads'` subscriber wakes on every token. A value-aware fix must compare selected values only where the selector returns an immutable snapshot. Comparing by identity is wrong for mutable stores such as `chat.nodes`.
- `conversation.view` renders 0.96 per token and is the chat list outlet. Its cost sits inside the chat inclusive figure.
- Trying `subscriptions: 'reads'` on the `freddie-menu-view` overlay entry did not reduce its renders, because the overlay reads session hooks during render. It was reverted.
