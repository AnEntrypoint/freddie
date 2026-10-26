# trav-gm-6 — complete

session: orch-fin-1792994560-7712-8
status: BLOCKED. The row stays pending; `blocked_by` is recorded in its notes.

## Outcome of the row's work

- The acceptance state holds on remote `main`: no raw NUL byte in `TrajectoryTable.js`, the separator at line 324 is the `\u0000` escape, and `requestKey(3, 'Step 2')` is `'3' + NUL + 'Step 2'`. The fix is `0312ec5d`. This run made no source edit.
- Witness: `1792995652694-1105-44f903b91bbb56ee`, verifier session `orch-fin-1792994560-7712-8-v1`, verified at `d555745a`. Witness-log line appended.
- CI for `d555745a` (receipts 01-04): publint success, run 40279100961.
- Close commit `bc59453b759bb8dd8c52558f8b4a4f7b769c22c5` on `main` (receipts 05-06; body carries `Row`, `Witness`, `Status: resolved`).

## Why the row is not resolved

`prd-resolve` refuses with `close_commit_required`: the store log has no close entry. Only `publish_on_origin` writes that entry, and `publish_on_origin` fails on any path with a real change, including dry runs.

## Routes tried for the close

1. `prd-resolve` with `witness_dispatch_id`, `witness_evidence`, `status`, `commit_sha`, `commit_comment` → `close_commit_required` (`refused-orch-fin-1792994560-7712-8-3611660-1792995719966-70`, `...-1792995730871-72`, `...-1792995862408-80`).
2. `publish_on_origin` with the full close (paths 05, 06, witness-log; witness; status; `dry_run` and live-form arguments) → `error_code=internal`, `Cannot read properties of undefined (reading 'toString')` (dispatches `1792995765182-3611660-d515da50eba06a71`, `...-1792995814473-3611660-40d69b3485700301`).
3. `publish_on_origin` with one path, with `repo_dir: "."`, and with `publish_base` set to `0efe05d9`: the same internal error for every changed path (`...-1792995783861-3611660-a50e97e855bea476`, `...-1792995822166-3611660-cf4a8b590315056d`, `...-1792995823296-3611660-4aea09c68c7607a2`). An unchanged path returns `nothing_to_publish`, so the verb runs and fails only when it builds a change.
4. Git API close commit `bc59453b` on `main`, with the `Row` / `Witness` / `Status` body and paths 05 and 06 → verified on `main`, but `prd-resolve` still refuses: the store log is not read from git history.
5. `prd-block` → `unknown_verb`: not registered in this runner build.
6. `prd-add` blocker row `trav-gm-6-blocker-orch-fin-1792994560-7712-8` → `blocker_row_refused`: a blocker of an open row must be a note on that row. Filed as `prd-note` on `trav-gm-6` (dispatch `1792995912124-1439-cb5284c7e1626460`).

Not used: `prd-close`. Its contract also closes a row, but it skips the commit gate that `prd-resolve` enforces. Using it would route around that gate, so it is left for the user to decide.

## Clears with

Repair `publish_on_origin` for changed paths in the gm-mcp runtime. Then:

- `publish_on_origin` with `repo_dir /config/workspace/freddie`, row `trav-gm-6`, paths `.gm/receipts/trav-gm-6/05-prove.md` and `06-decide.md`, `publish_base 0efe05d90129d57a903b66b2e0756c75447afb68`, witness `1792995652694-1105-44f903b91bbb56ee`, status `resolved`.
- `prd-resolve` for `trav-gm-6` with the same `witness_dispatch_id`.

## Other state

- The shared `.gm/witness-log.md` line for this witness is uncommitted. The file is shared with other lanes, so it was not published.
- The published commit `d555745a` has a doubled backslash in its body (`\\u0000`, from shell quoting). It is recorded here; it was not rewritten.
