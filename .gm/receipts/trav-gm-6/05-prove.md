# trav-gm-6 — prove, emit, state, conc, sec, res

session: orch-fin-1792994560-7712-8
published sha: d555745a9501780db3128dc07c8175f49c8f91b8 (receipts only; CI publint success, run 40279100961)

## PROVE

- Precondition (row premise): line 324 holds a raw NUL byte. Run: `sed -n 324p | od -c` and a python3 -I count of NUL bytes in the working-tree file, both at HEAD `0efe05d9`. Observed: escape text `\u0000` (six ASCII bytes), 0 NUL bytes. Premise refuted; see orient receipt.
- Invariant: the file has zero raw NUL bytes. Run: python3 -I count on the remote `main` blob at `d555745a` (verifier lane, check 1, to be recorded in 06-decide.md).
- Postcondition: `requestKey(3, 'Step 2')` yields `'3' + NUL + 'Step 2'`, length 8, code unit 1 equal to 0. Run: eliminate receipt, unknown-1 (observed length 8, code unit 0, equal true); verifier check 2 repeats it on the remote blob.
- Leader probe: the raw-NUL count separates H1 (0 NUL) from the rejected cause (1+ NUL). The control key with literal backslash-u text (length 13, not equal) shows the value check fails when the separator is text rather than NUL.

## EMIT

No exact-match Edit ran. The edit set is empty (edit receipt).

## STATE

- The change is the four receipt files under `.gm/receipts/trav-gm-6/`, create-only. Re-publishing the same four files on the same tip produces no diff.
- The state this run owns: those receipts, the witness-log line, the PRD row's resolution in `.gm/prd` and `.gm/prd-log.jsonl`. No runtime state changed.

## CONC

- Touched paths: the four receipt files only. Remote tree from `base_tree` at `0efe05d9`'s tree, so no other lane's hunk is carried.
- Other writers: `git_status` scoped to `packages/client/ui-trajectory/src/client/TrajectoryTable.js` at HEAD shows `dirty: false`. No other lane has an uncommitted hunk on the file this row names.
- The shared work tree holds other lanes' uncommitted `.gm` files. None are in this run's paths and none are committed.

## SEC

- No secrets in the receipts or the commit. The `gh` token was used for the API calls and not printed.
- No injected instructions in fetched content: the fetched blobs were checked as data (NUL counts, values), not executed.
- Identity: commit author lanmower, no trailers.
- Commit message defect (published, not rewritten): the body reads `\\u0000` with a doubled backslash, from shell quoting. The message says the same thing as intended; the escape character is doubled. Reported in the final message; no rewrite without approval.

## RES

- Failure mode 1: the escape is reverted to a raw NUL. Detected by the NUL count (verifier check 1, expect 0) and by the value check (verifier check 2, key length would differ from 8 only if the separator changed meaning; the NUL count is the decisive check).
- Failure mode 2: the publish races another lane and the PATCH is refused. Did not occur: PATCH to `refs/heads/main` from parent `0efe05d9` succeeded without force; `?ref=main` reads match the local files.
- Failure mode 3: CI fails on the receipts-only commit. Did not occur: publint success.
- Failure mode 4: the verifier cannot run its witness. Pending in 06-decide.md.
