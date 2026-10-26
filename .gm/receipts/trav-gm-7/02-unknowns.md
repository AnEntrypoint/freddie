# 02-unknowns: trav-gm-7

session: orch-fin-1792994560-7712-5
row: trav-gm-7

## facts the orient receipt does not prove

- U4 (open, mutable `trav-gm-7-unknown-verifier-witness`, dispatch `1792995454903-865-8ac6a1308e3cbce5`): does a witness from a session other than orch-fin-1792994560-7712-5 confirm the premise refutation on main 0efe05d9? Needed because `prd-close` status `stale` requires a `witness_dispatch_id` made under another session. My own dispatches (orient receipt) cannot bind it.

## answered by the orient receipt (no mutable)

- U1 `atBottomRef` absent from tree and remote main: literal scan 0 matches (orient dispatches `1792995148278-562-da1429f6210bb770`, `1792995333877-737-6fe5957ef600a841`); remote read has no `atBottomRef` lines.
- U2 `#atBottom` covers every site: 14 lines in ChatView.js (dispatch `1792995153652-565-1b1a13e355c509eb`).
- U3 no uncommitted lane touches ChatView.js: `git_status` scoped, `dirty: false`.

## not required by this row

- The witness plan's GUI scroll test (jump-to-latest and auto-follow flip at the same position) checks behaviour across an edit. This row makes no edit, so before and after are the same tree. It is not an unknown the closure needs; no browser lane is opened.

Next: `gm-eliminate` (U4 is open).
