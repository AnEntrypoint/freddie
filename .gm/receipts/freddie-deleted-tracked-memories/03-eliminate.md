# 03-eliminate: freddie-deleted-tracked-memories

session: mcp-codemode-3535970-1793542718115-1-11

## U1: is the 13-file deletion still present, or the pre-reconcile state of 305d0aa8?
- expected (from row contract, before run): 13 tracked .gm/memories files reported deleted.
- live run: git_status paths=[.gm/memories] summary, dispatch 1793543347566-532-5843a6aac155e01b. deleted: 0, modified: 0, untracked: 0.
- observed: 0 deleted. Mismatch with the row premise, so the premise is stale at this HEAD.
- supporting: fs_readdir .gm/memories total 442; git_tree HEAD .gm/memories count 442; 230 sampled HEAD entries present on disk (orient receipt).
- commit evidence: 305d0aa8 re-keyed 39 tracked files out and 48 in; eeb13bc7 (2026-10-13) reconciled them as renames at 92%+ similarity.
- result: KNOWN. The working-tree deletion is absent; the reconcile commit closed it before this run.

## U2: which surface serves recall for the witness clause (c)?
- expected: a verb that returns a stored memory body for a verbatim query.
- live run 1: gm.list() has no recall verb (names checked: memorize_continue, search, codesearch are the only memory-adjacent surfaces).
- live run 2: codesearch dual with a verbatim fragment of .gm/memories/mem-0000e62357033dbb-246.md, dispatch id not retained by the parsing call (the reply was split for memory-path counting). bm25 channel: skipped route_without_index. Memory-path hits: 0 of 6 paths.
- observed: no callable recall surface returns a .gm/memories body. Clause (c) cannot be witnessed through this bundle's verbs.
- result: KNOWN, negative. Recorded as friction for the gm agent (codesearch does not index .gm/memories on bm25).

## U3: where does the reason record belong?
- expected: a receipt in .gm/receipts/<row>/ (gm-prd: stage receipts are the evidence).
- evidence: the stale-premise precedent commits (82ce10ca, 0fc117e5, 9b2d5ba1, 82e7b8d9, 57a6a433, af350da9) carry subject "chore(prd): ... receipts for stale premise" and touch .gm/receipts paths.
- result: KNOWN. Reason lives in the receipts; no row-text edit needed for the reason itself.

## consequence for EDIT
- No file was deleted, so no restore from HEAD is required. Clause (a) holds as "no deleted .gm/memories entry before and after" with before = after = 0.
- Clause (c) has no restored memory to recall. The row cannot close on its own witness; the orchestrator decides the closing witness through prd-resolve.
- EDIT scope: the receipts for this row (01 through 03 plus the edit receipt). No file under .gm/memories is changed.
