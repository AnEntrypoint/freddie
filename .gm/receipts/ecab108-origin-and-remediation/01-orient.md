# 01-orient: ecab108-origin-and-remediation

session: mcp-codemode-3535970-1793542718115-1-12
row file: .gm/prd/ecab108-origin-and-remediation.yml (route_family grounding, status pending, no description, no acceptance text)
aggregate copy: .gm/prd.yml lines 1-5 (same row, duplicated)

## acceptance (derived)

clause: "The commit ecab108 and its push timing are each checked against the local object store and against origin independently; origin confidence is stated as a bound; every confirmed cleanup target names a recoverable forensic reference (a commit whose tree holds its content)."
source: row subject "Pre / Invariant / Post" text (.gm/prd/ecab108-origin-and-remediation.yml:3)

## symbols

The row names no symbol. callers and impact were not run (nothing to query).

## code search (codesearch, query "ecab108", mode dual requested)

- Served mode: symbol. bm25 group: skipped (route_without_index). Friction: dual mode did not serve bm25 on this route.
- definitions: 0. references: 6, all in the row's own copies:
  - .gm/prd.yml:1-3
  - .gm/prd/ecab108-origin-and-remediation.yml:1-3
  (both lines re-read and present in the tree)
- commits channel: complete, no commit hit listed.
- Dispatch was starved on the store lane and hit store_busy twice before answering; both retries used byte-identical bodies.

## facts

F1 local: `git cat-file -t ecab108` is "Not a valid object name"; `git rev-parse --disambiguate=ecab108` prints nothing. No object in the local store has that prefix.
F2 local HEAD: main = d1a4c802531e18d981745a0752e7dae314b4eb88, committer 2026-10-26T07:10:22Z.
F3 origin refs: `git ls-remote origin` lists only HEAD and refs/heads/main, both d1a4c802531e18d981745a0752e7dae314b4eb88.
F4 origin lookup: `gh api repos/AnEntrypoint/freddie/commits/ecab108` returns HTTP 422 "No commit found for SHA: ecab108". Calibration: `commits/d1a4c8` (6 chars) resolves to d1a4c802531e, so the miss is an absence, not a short-SHA format artifact. `search/commits?q=hash:ecab108+repo:AnEntrypoint/freddie` total_count 0.
F5 origin timestamps: origin main commit committer date 2026-10-26T07:10:22Z; repos.pushed_at 2026-10-26T07:11:07Z. Local and remote agree on d1a4c802.
F6 git_log --all (first 400 of the reply, reply truncated) does not list ecab108.

Origin confidence (bound): no commit with prefix ecab108 is reachable from any origin ref, and the origin API does not resolve it. Not probed: fetching an unreachable object by sha. The row's "commit ecab108 exists and was pushed" premise is not supported by any witness here.

## cleanup targets

Cleanup target: 52 tracked paths under .gm/receipts/ deleted in the shared worktree (git status " D"). All 52 are present in HEAD (`git cat-file -e HEAD:<path>` succeeds for 52/52), so each has a recoverable forensic reference: `git show <commit>:<path>` with the commit below.

Last-touch commit groups (commit: count):
- ec197703: 13 (trav-gm-9, 01 to 12)
- c4bcf50f: 9 (gm-freddie-adapter-canonical-fields-20261007, 01 to 09)
- dd598847: 5 (trav-gm-50, 01 to 05)
- d555745a: 4 (trav-gm-6, 01 to 04)
- 82e7b8d9: 4 (trav-gm-37, 01 to 04)
- 82ce10ca: 4 (trav-gm-35, 01 to 04)
- 57a6a433: 4 (trav-gm-38, 01 to 04)
- 7bc6fe1f: 3 (trav-gm-7, 01 to 03)
- 0fc117e5: 3 (trav-gm-36, 01 to 03)
- bc59453b: 2 (trav-gm-6, 05 and 06)
- 863e0df9: 1 (trav-gm-6, 07)

Full path to commit mapping: `git log -1 --format=%h -- <path>` for each path in the deleted list (regenerable, no file written).

## no-op guarantee

Nothing was deleted, restored, or written in the tree by this stage. Scratch list at /tmp only.
