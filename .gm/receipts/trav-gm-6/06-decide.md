# trav-gm-6 — decide

session: orch-fin-1792994560-7712-8
sha: d555745a9501780db3128dc07c8175f49c8f91b8

## Checked against the row's words

Row acceptance: replace the raw NUL at `TrajectoryTable.js:324` with the `\u0000` escape, leaving the runtime key unchanged.

- Raw NUL count at remote `main` (`d555745a`): 0 (verifier check 1, shell run, 108058 bytes).
- Separator is the escape: line 324 `return \`${turn}\u0000${group}\`` (remote blob, verifier check 2 source lines 323-325).
- Runtime key unchanged: `requestKey(3, 'Step 2')` has length 8, code unit 1 equal to 0, and equals `'3' + NUL + 'Step 2'` (verifier gm dispatch 1792995652694-1105-44f903b91bbb56ee).
- Leader hypothesis H1 (SPECIFY): witnessed. No rejected hypothesis is in the witness. The rejected cause (raw NUL present) is refuted by check 1.

## Witness

- Session: `orch-fin-1792994560-7712-8-v1` (verifier), not the executor's session.
- Dispatch id: `1792995652694-1105-44f903b91bbb56ee`. Witness-log line appended to `.gm/witness-log.md`.
- Verifier result: `STATUS: verified 1792995652694-1105-44f903b91bbb56ee`.
- Verifier check 3: commit `d555745a` present, author lanmower, subject matches.

## Push and CI

- Publish: Git API route (shared work tree). Blobs, tree on remote tip `0efe05d9` tree, commit `d555745a`, PATCH `refs/heads/main` without force. `?ref=main` reads match the four local files.
- CI: `ci-status` for `d555745a` → `run_status: success`, publint 1/1 success, run 40279100961.

## Decision

Witness and CI are green for the same sha. The row resolves with `prd-resolve` binding `witness_dispatch_id` `1792995652694-1105-44f903b91bbb56ee` and the CI result for `d555745a`.

## Not done

No source edit. The row's defect was fixed in `0312ec5d`; this run's commits contain receipts only.
