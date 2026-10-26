# 03-eliminate: trav-gm-36

session: orch-fin-1792994560-7712-23
row: trav-gm-36

## U4: witness from another session

- Expected (written before the run, from the row's own contract): `prd-witness-request {id: trav-gm-36}` records a request on the row, excludes this session, and returns a verifier brief. It returns no witness dispatch id, since this session cannot witness its own row.
- Run 1: `prd-witness-request {id: trav-gm-36}`, dispatch `1792996827116-2188-8dada81d714b2411`. Refused: `.gm/prd/trav-gm-35.yml` contains non-empty content that failed to parse as YAML (`mapping values are not allowed in this context at line 5 column 25`). The write is aborted, so the store refuses this row's request.
- Run 2 (after `wait {"ms": 3000}`, dispatch `1792996837320-2195-4761a985fa902000`): `prd-witness-request` refused again, dispatch `1792996837892-2196-2cf1494ea12276d2`, same fault.
- Alternate route: `prd-note {id: trav-gm-36}`, dispatch `1792996843604-2201-6be30e59100f0bb0`: `ok: true`, note recorded on the row.
- A separate blocker row `trav-gm-36-blocker-orch-fin-1792994560-7712-23` was refused (dispatch `refused-orch-fin-1792994560-7712-23-3892076-1792996851734-42`): `prd-add` refuses a blocker of an open row and says to annotate the parent. The blocker is therefore recorded as a note on trav-gm-36.
- Not eliminated in this run. The fault is in `trav-gm-35.yml`, which is outside this row. This run does not open or edit that file.
- Result: U4 open. Clears with `prd-witness-request {id: trav-gm-36}` from another session, once `trav-gm-35.yml` parses.

## outcome

- Open unknowns: U4 (blocked: witness request refused by an unrelated row's YAML fault).
- No unknown is open that a probe can still answer here. The stale premise is established by the orient runs and by commit `1bc78c61` (its patch removes `onboardingReadiness` from `store.js`).
- gm-edit is not loaded: no edit is needed, since the export is already absent and `providerUsable` keeps a live consumer.
- Blocker: recorded as a note on `trav-gm-36`, not a separate row (see above).
