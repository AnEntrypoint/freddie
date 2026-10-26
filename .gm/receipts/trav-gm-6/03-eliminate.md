# trav-gm-6 — eliminate

session: orch-fin-1792994560-7712-8
input: `.gm/receipts/trav-gm-6/02-unknowns.md`

## trav-gm-6-unknown-1 — known

- Question: does the escape `\u0000` at `TrajectoryTable.js:324` evaluate to the same NUL-separated key the raw-NUL form produced?
- Expected (written before the run): `requestKey(3, 'Step 2')` has length 8, code unit 1 is 0, and equals `'3' + NUL + 'Step 2'`.
- Run: `sed -n 323,325p` of the file to `/tmp/trav-gm-6-requestkey.js`, then `node /tmp/trav-gm-6-check.cjs` (shell run, no gm dispatch id; scratch files outside the repo).
- Observed: `{"key_length":8,"key_code_unit_1":0,"key_equals_expected_nul":true}`, exit 0.
- Control (instrument discriminates): the literal backslash-u text `'3\u0000Step 2'` gives length 13 and `control_equals_expected_nul: false`.
- Resolved with `mutable-resolve` (dispatch 1792995469436-889-255f62501e6bb336).

## trav-gm-6-unknown-2 — known

- Question: does `TrajectoryTable.js` parse at HEAD with the escape line in place?
- Expected (written before the run): `node --check` exit 0.
- Run: `node --check packages/client/ui-trajectory/src/client/TrajectoryTable.js` (shell run).
- Observed: exit 0.
- Resolved with `mutable-resolve` (dispatch 1792995469985-890-52b727ffa3d5ce5e).

## New unknowns

None. Both runs answered their question without revealing another.

## Open unknowns

None. Next stage: gm-edit.
