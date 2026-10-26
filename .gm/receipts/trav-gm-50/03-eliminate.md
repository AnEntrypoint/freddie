# trav-gm-50 — 03 eliminate

session: orch-fin-1792994560-7712-15

Expected values are derived from the row's contract (a copy reset must not render after its block is disconnected; a copy with no disconnect must reset to Copy), not from the code checked.

## U1 — disconnect while clipboard write pending

- expected (contract): 0 reset renders after disconnect.
- run: `node /tmp/trav-gm-50/witness.mjs` against HEAD, output `/tmp/trav-gm-50/head-run.txt`, sha256 c5579abd1f50e85185ea428cd2743db4c7519002ea450e3051a9865c6ada1544, UTC 2026-10-26T06:20:56Z. An earlier identical run preceded it (same expected values, same observed counts).
- observed: `arm disconnect-while-clipboard-pending renders_after_disconnect=2`.
- result: CONFIRMED defect. Known.

## U2 — settled copy then disconnect (row witness_plan)

- expected (contract): 0 reset renders after disconnect.
- observed: `arm settled-then-disconnect copied_label=Copied renders_after_disconnect=0`.
- result: matches. The row's cited defect (reset timer not cancelled on the settled path) is absent at HEAD. Known: the cited defect is already fixed by 057a19f0.

## U3 — control observes the reset cycle

- expected (contract): a copy with no disconnect shows Copied, then reverts to Copy within the reset window.
- observed: `arm control-no-disconnect copied_label=Copied renders_after_click=1 final_label=Copy`.
- result: matches. The instrument sees the reset, so the zeros in U2 and the 2 in U1 are meaningful. Known.

## U4 — consumer reuse under a stop-time flag

- new unknown found during U1 analysis; recorded with mutable-add (trav-gm-50-U4).
- expected (contract): every consumer makes a fresh helper per connection and stops it on disconnect.
- evidence: codesearch literal copyFeedback, dispatch 1792995528742-960-f6452ec4de88dc9f: stop() on disconnect and field nulled in DiffBlock.js:83-84, ReadBlock.js:61-62, SearchBlock.js:72-73, TerminalBlock.js:71-72, markdown/CodeBlock.js:54-55. callers createCopyFeedback, dispatch 1792995207164-621-354ddad69513ed16: each creation sits in connectedCallback (DiffBlock.js:78, ReadBlock.js:46, TerminalBlock.js:66, SearchBlock.js:67, CodeBlock.js:36).
- result: matches. Known: a stop-time flag inside the helper cannot change any consumer's reuse.

## Open unknowns

None. gm-edit next.
