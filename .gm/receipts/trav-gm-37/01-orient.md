# 01-orient: trav-gm-37

session: orch-fin-1792994560-7712-22
row: trav-gm-37
file: packages/client/connection/src/client/api.js

## acceptance

Row text (not derived): "Delete the export." Witness plan: "Reload the GUI and confirm RPC calls still succeed; codesearch for resultOf returns only its definition."

## row premise

Row claims `resultOf` is exported at `packages/client/connection/src/client/api.js:8` with no importer in `packages`.

## tree state (live)

- Local checkout: `api.js` has six statement lines (1-6: re-exports of `RpcId`, `SESSION_SEARCH_RESULT_LIMIT`, `transportError`, `AbstractApiClient`). No line 8 and no `resultOf`. Read by path, this session.
- Upstream tip `584363ee5a49`: `gh api contents ?ref=584363ee5a499d737fac37766a44aab31ab3b1d2` decodes to identical content. No `resultOf`.
- `codesearch` literal, whole word, `resultOf`: 0 matches (dispatch `1792996529677-1999-a34edcf552d5745d`, 4857 files scanned). The tree is stale (`complete: false`, `stale_tree`), so this zero is not a finding on its own.
- `codesearch` dual, `resultOf` (dispatch `1792996595258-2051-cb8b27420841dac5`): `literal_scan_matches: 0`, `literal_scan_exhaustive: true`. The BM25 and vector rows are nearest neighbours, not occurrences.
- GitHub code search `resultOf repo:AnEntrypoint/freddie`: `total_count` 0.
- `callers resultOf` (dispatch `1792996521668-1991-53ab1e2a79d396f0`): `total` 0, `codeinsight_index.complete: true`, 3017 files listed.
- `impact resultOf max_depth 3` (dispatch `1792996522371-1992-ffba45c78e6eff8e`): `total` 0.

## why the export is already gone

- Commit `1bc78c61170a7a7e23f1dc7d778399a0a1dd4601` ("refactor(client): remove dead exports and a dead module, and share the head-tail cap") deletes `export function resultOf(response)` from `packages/client/connection/src/client/api.js` (patch line 6, `-export function resultOf`). Its message: "No importer existed for the removed exports (resultOf, createFixtureFaces, ...)".
- Upstream: `gh api compare 1bc78c61170a...584363ee5a49` returns `status: ahead`, `ahead_by: 30`, `behind_by: 0`. The removing commit is an ancestor of the upstream tip.

## verdict (SPECIFY leader hypothesis)

Premise stale. The export the row names was deleted on `main` by `1bc78c61`. The acceptance "Delete the export" already holds on the upstream tip and in the local checkout. Leader: no source edit is needed; the row closes as stale through a witness from another session, as `trav-gm-7` did (`7bc6fe1f`).

Witness plan clause 2 ("codesearch for resultOf returns only its definition") cannot match: there is no definition left. The verifier must check that `resultOf` has zero definitions and zero importers, which is the acceptance's own meaning.

## facts the row relies on

- No importer: `codesearch` literal zero; `callers` zero with a complete index.
- The file still exports `RpcId`, `SESSION_SEARCH_RESULT_LIMIT`, `transportError` and `AbstractApiClient`. The row does not touch them.
- Local `HEAD` `7bc6fe1f` is 2 ahead and 19 behind upstream as of the last fetch (`stale_tree`). The verdict above holds on both sides.
