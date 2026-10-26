# trav-gm-50 — 04 edit

session: orch-fin-1792994560-7712-15
HEAD at edit start: 7bc6fe1f (main). No MERGE_HEAD.

## Changed paths

- packages/client/ui-primitives/src/use-copy-feedback.js
  - `createCopyFeedback`: adds `let stopped = false`; the clipboard `.then` returns early when `stopped`, before arming the reset timer; `stop()` sets `stopped = true` before clearing the timer.

## Why

U1 (03-eliminate.md) observed 2 reset renders after disconnect when the clipboard write settled after disconnect. stop() cleared nothing then, and the timer was armed afterwards. The flag closes that path inside the owner of the timer. CodeBlock.js is not changed: it already calls stop() (row acceptance met at HEAD, 057a19f0).

## Callers checked before the edit

- callers createCopyFeedback, dispatch 1792995207164-621-354ddad69513ed16: 5 callers, all connectedCallback (DiffBlock.js:78, ReadBlock.js:46, TerminalBlock.js:66, SearchBlock.js:67, markdown/CodeBlock.js:36).
- U4 (03-eliminate.md): every consumer stops and drops its helper on disconnect and creates a fresh one on connect, so the flag changes no consumer's reuse.

## Not changed

- markdown/CodeBlock.js, DiffBlock.js, ReadBlock.js, SearchBlock.js, TerminalBlock.js, clipboard.js.
- No test files (gm §3).
