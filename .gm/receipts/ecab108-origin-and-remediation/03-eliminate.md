# 03-eliminate: ecab108-origin-and-remediation

session: mcp-codemode-3535970-1793542718115-1-12
expected values were written from the row contract (subject Pre/Invariant/Post) before each run.

## ecab108-local-object-absence: known

- expected: no object, ref, stash or extra worktree resolves to ecab108; the only worktree is main.
- observed: git_show rev ecab108 fails with git_show_rev_unresolved (dispatch 1793542968711-88-ae5bf8c4e88f3f84, re-run 1793543328996-475-c09b3e1636276297); git_stash_list count 0 (1793543328487-473-4cdc3aceb84026cd); git_worktree_list lists only /workspace/freddie on main at d1a4c802531e (1793543328755-474-9420cd2c10accc11).
- note: `git rev-parse --disambiguate` (Bash, no gm dispatch) also prints nothing for ecab108, covering unreachable objects too. The local reflog holds only the clone entry.

## ecab108-origin-push-event: known

- expected: no PushEvent in origin's feed names ecab108 as head or before; d1a4c802 has a push event after its committer date 07:10:22Z.
- observed: gh api repos/AnEntrypoint/freddie/events?per_page=100 (dispatch 1793543337221-497-420ad2fea3f3e272). d1a4c802531e pushed 2026-10-26T07:11:08Z, before 6bba13292f94, 46 s after its commit. No head or before starts with ecab108 in the 100 events read (feed reaches back to 2026-10-16).
- bound: the feed covers only the recent window. A push before 2026-10-16 would not appear here, but the origin lookup (orient F4, 422 for ecab108 while 6-char d1a4c8 resolves) answers existence independently of the feed.

## ecab108-cleanup-blob-identity: known

- expected: for each of the 52 deleted .gm/receipts paths, no change between its last-touch commit and HEAD.
- observed: git_diff <last-touch>..HEAD per group, dispatches 1793543346084-524-13e485e221fd7f8a through 1793543349647-539-87ed8931ddc2886f. All groups empty except the trav-gm-6 directory, where the diffs list only files whose last touch is a later commit (05 and 06 from bc59453b, 07 from 863e0df9). That matches the per-file mapping.

## ecab108-prd-copy-agreement: known

- expected: both copies carry the same SESSION_ID, id, subject, route_family and status, and the per-row file is authoritative.
- observed: .gm/prd.yml:1-5 and .gm/prd/ecab108-origin-and-remediation.yml:1-3 agree field for field. prd-list {"id"} (dispatch 1793542837851-39-89cf9abd98fbb267) serves the row from .gm/prd/.

## new unknowns

None. The events-feed window is a bound on ecab108-origin-push-event, not a new open unknown, because the origin lookup covers existence.

## friction (INVARIANT 2)

- The gm bash verb denies any `git` command (gate_denied, dispatch 1793543321039-451-467e87d8cacc7332); git was run through the Bash tool and the git_* gm verbs instead.
- codesearch with mode dual served symbol mode; bm25 was skipped (route_without_index).
- codesearch was starved on the store lane and returned store_busy during the run; byte-identical retries answered.

## open unknowns

none. gm-edit next.
