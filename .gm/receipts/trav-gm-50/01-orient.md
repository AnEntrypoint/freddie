# trav-gm-50 — 01 orient

session: orch-fin-1792994560-7712-15
row: trav-gm-50 (pending, read with `prd-list {"id":"trav-gm-50","full":true}`)
subject: CodeBlock reimplements the copy-feedback lifecycle; reset timer not cancelled on disconnectedCallback.

acceptance (row text, not derived): Use createCopyFeedback in CodeBlock and call its stop() from disconnectedCallback.
witness_plan (row text): click Copy on a fenced code block, remove the block within one second; the CodeBlock reset timer must not fire after disconnect.

## Tree facts (HEAD, read this run)

- packages/client/ui-primitives/src/markdown/CodeBlock.js:3 imports createCopyFeedback from '../use-copy-feedback.js'.
- CodeBlock.js:36 connectedCallback creates `this.#copyFeedback = createCopyFeedback(...)`.
- CodeBlock.js:53-55 disconnectedCallback calls `this.#copyFeedback?.stop()` then nulls the field.
- CodeBlock.js:64 is `#trimmed()`. The row's cited "reset timer (line 64)" is stale.
- packages/client/ui-primitives/src/use-copy-feedback.js:3 COPIED_FEEDBACK_MS = 1000.
- use-copy-feedback.js:5-34 createCopyFeedback. resetTimer is armed inside the `.then` of writeClipboard (lines 18-25). stop() (lines 27-32) clears resetTimer only if it is already armed.

## History

- Introducing commit: 057a19f0ef6fa9a31a8a4ac632ae9f6e0120550d (2026-10-16), "fix(client): repair store rehydration, timers and listeners, and small UI logic". Its CodeBlock.js diff adds the createCopyFeedback import and call and the `this.#copyFeedback?.stop()` in disconnectedCallback.
- The row was filed 2026-10-16 (session gm-prd-refile-improvements-20261016) and describes the pre-057a19f0 file.
- Conclusion: the acceptance clause is already satisfied at HEAD.

## Callers and impact (codeinsight, index complete: true)

- callers createCopyFeedback: 5 distinct, all connectedCallback. DiffBlock.js:78, ReadBlock.js:46, TerminalBlock.js:66, SearchBlock.js:67, markdown/CodeBlock.js:36.
- impact createCopyFeedback, max_depth 3: callees only onChange; tests_reached 0.
- codesearch literal createCopyFeedback: 12 matches in 7 files, 4819 scanned, exhaustive.
- codesearch literal copyFeedback under ui-primitives/src/**: 30 matches in 5 files, exhaustive. Every consumer calls stop() in disconnectedCallback and nulls the field. Each consumer makes a fresh helper per connection, so no consumer reuses an instance after stop().

## Residual found while reading (becomes unknown U1)

onCopy arms resetTimer inside the clipboard promise. A disconnect while the clipboard write is still pending calls stop() when there is no timer to clear. The timer is then armed after disconnect and never cancelled. This is the same lifecycle defect the row names, reached through the pending-clipboard path.

## Unknowns for gm-unknowns

- U1: at HEAD, does the disconnect-while-clipboard-pending path fire a reset render after disconnect?
- U2: at HEAD, does the settled-then-disconnect path (the row's witness plan) fire any reset render after disconnect?
- U3: does the instrument observe a reset when no disconnect happens (control)?
