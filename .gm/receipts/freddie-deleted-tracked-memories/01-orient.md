# 01-orient: freddie-deleted-tracked-memories

session: mcp-codemode-3535970-1793542718115-1-11
row: .gm/prd/freddie-deleted-tracked-memories.yml (status pending; subject is the row's acceptance source)

## acceptance (derived)
- Source: row subject. Clauses: (a) the 13 tracked .gm/memories/*.md files shown as deleted are restored from HEAD, or the deletion is recorded as intended with its writer; (b) git_status has no deleted .gm/memories entry before and after; (c) recall returns a restored memory.

## live state at orient
- git_status paths=[.gm/memories]: deleted 0, modified 0, untracked 0. Full git_status counts: deleted 0.
- Disk .gm/memories: 442 files (fs_readdir total 442). git_tree HEAD .gm/memories: count 442. Sampled 230 HEAD entries, all present on disk.
- Session-start snapshot listed .gm/receipts/... first. Git orders paths lexically and .gm/memories sorts before .gm/receipts, so that snapshot shows no memory deletions (inferred from ordering, not re-run).

## cause evidence (commit log, not yet an instrument run)
- 305d0aa8 (2026-10-12, lanmower) "chore(gm): rekey memory files under .gm/memories": message states the gm memory sync re-keyed its files; 39 tracked mem-*.md removed under old keys, 48 untracked added under new keys; 39 deleted bodies match an added body.
- eeb13bc7 (2026-10-13, lanmower) "chore(gm): reconcile rekeyed memory files under .gm/memories": renames at similarity 92% and up.
- codesearch dual "memorize prune memory files .gm/memories writer" and "recall memory restored gm memory store": bm25 channel skipped (route_without_index); commits channel returned only 305d0aa8 and eeb13bc7 for .gm/memories paths. No repo source writes .gm/memories.
- codeinsight callers and impact for symbols memorize and recall: zero call edges after index sync (complete true, files_listed 3017). Those names are verbs or skills, not JS symbols in the index. The first attempt was refused while the index was incomplete; sync took 3 passes.

## facts the row relies on
- F1: .gm/memories is tracked and not ignored (.gitignore comment: memory follows the codebase; no .gm/memories rule).
- F2: The re-key was a gm memory-sync writer, not memorize-prune (no repo code path; commit message names the sync).
- F3: At orient, no tracked .gm/memories file is missing from the working tree.
- F4: 305d0aa8 is the origin of the 39 removed old keys; eeb13bc7 reconciled them.

## open for gm-unknowns
- U1: Is the 13-file deletion the pre-reconcile state of 305d0aa8 (i.e., already resolved by eeb13bc7 on 2026-10-13)?
- U2: Which verb serves recall for the witness (gm verb list has no recall; check memorize_continue and search).
- U3: Where the reason record belongs (receipt only, or the row text).
