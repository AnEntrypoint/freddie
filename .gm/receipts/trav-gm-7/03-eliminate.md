# 03-eliminate: trav-gm-7

session: orch-fin-1792994560-7712-5
row: trav-gm-7

## U4: verifier witness from another session

- Expected (from the row contract and the gm verb contract): a live run recorded under a session other than orch-fin-1792994560-7712-5 (and not the executor gm-prd-refile-improvements-20261016) confirms the premise refutation, so `prd-close` status `stale` can bind a `witness_dispatch_id`.
- Live check run: `prd-witness-request {id: trav-gm-7}`, dispatch `1792995473817-891-93634c378b827260`. Observed: request recorded on the row; `excluded_sessions` = [gm-prd-refile-improvements-20261016, orch-fin-1792994560-7712-5]; `verifier_brief` = load gm-prd with `mode=witness` under a fresh session id.
- Result: NOT eliminated in this run. The witness is produced by a verifier session that the orchestrator spawns; this worker cannot produce one under another session id without impersonating it, which the self-witness rule forbids.
- Reason the check cannot run here: a witness session must be spawned by the orchestrator (gm-orchestrate, Verification and CI lanes). Recorded as the blocker below.

## premise probes already run (orient, live)

- Literal `atBottomRef` whole word: 0 matches over 4819 files, dispatch `1792995148278-562-da1429f6210bb770`.
- Dual `atBottomRef`: `literal_scan_matches: 0`, dispatch `1792995333877-737-6fe5957ef600a841`.
- Remote `main:ChatView.js`: no `atBottomRef` lines; `#atBottom` on 14 lines.
- Commit `0312ec5d49` deleted all 10 `atBottomRef` diff lines.

## outcome

- Open unknowns: U4 (blocked on a verifier session).
- No edit is required: the acceptance ("one `#atBottom` field, read at every site") holds on `main` `0efe05d9`. gm-edit has nothing to change, so this run does not load gm-edit.
- Blocker: `trav-gm-7-blocker-orch-fin-1792994560-7712-5`.
