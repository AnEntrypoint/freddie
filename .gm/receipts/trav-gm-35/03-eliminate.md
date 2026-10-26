# 03-eliminate: trav-gm-35

session: orch-fin-1792994560-7712-24

Live JIT checks, each with its expected value written before the run (derived from the row's contract).

## 1. Node import of fields.js (trav-gm-35-node-import-fields): known
- expected: module loads; `ValueField` is a function; `SecretField` is undefined.
- observed: keys `["ValueField"]`, `ValueField` `function`, `SecretField` `undefined`. Matches.
- dispatch: 1792996783974-2161-6bab355ae54f49d4 (exec_js, `import()` of the real file under node).

## 2. Local and upstream fields.js identical (trav-gm-35-main-fields-hash): known
- expected: sha256 equal on local checkout and upstream `main`.
- observed: local `aab98c5a1e303947ea6c1b8b9ed6f0857aea55862c4f0f48fd431bb43c87c40b`; upstream raw `main` HTTP 200, same hash. Matches.
- dispatch: 1792996784949-2162-4ee92cb8824ca314.

## 3. Row file tracked by git (trav-gm-35-row-yml-tracked): known, expected did NOT match
- expected: `.gm/prd/trav-gm-35.yml` has commit history, so a correction to it lands in the publish commit.
- observed: `git_log` on the path returns no commits. The file is untracked.
- `git_status` cannot show it: `.gm` is in its excluded list.
- consequence: the row file does not travel with the publish commit. It reaches a commit only by explicit path; this run does not add it (see 04-edit).
- dispatch: 1792996785524-2163-8ac17734626a47aa (git_log), 1792996793320-2165-758023d0ace6ba48 (git_status scoped; excluded .gm).

## New unknowns
- none.

## Open unknowns
- none. Next stage: gm-edit.
