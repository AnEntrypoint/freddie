# 01-orient: trav-gm-35

session: orch-fin-1792994560-7712-24
row: trav-gm-35 (pending; session gm-prd-refile-improvements-20261016)

## Row
- acceptance (row's own): "Delete the SecretField export and any helper left unused."
- subject: SecretField is exported but never imported, so the secret-field factory has no consumer.
- cited: packages/client/ui-settings-plugins/src/client/fields.js:43 (principle NODELETE)
- witness_plan (as filed): "Edit and save a secret value in Settings > Plugins; the behaviour is unchanged and codesearch for SecretField returns only its definition."

## Cited file and symbol (checked against the tree)
- fields.js exists: 1361 bytes, 41 lines (fs_stat 1792996538070-2005-2f40f23fd7bb3ca3). Read at the located path.
- Line 43 does not exist. The file exports only `ValueField` (lines 4-41).
- Upstream `main` `fields.js`: 1361 bytes, same content, no `SecretField` (gh api contents ?ref=main, dispatch 1792996567609-2029-b11770b171538bc2).

## Evidence that the symbol is gone
- git_show 1bc78c61 (dispatch 1792996658048-2088-ac46473c347dd5c1): commit "refactor(client): remove dead exports and a dead module" (2026-10-16) deletes `export function SecretField` from fields.js (hunk `@@ -39,26 +39,3 @@`) and names SecretField among exports with no importer.
- 1bc78c61 is in local HEAD history (git_log on fields.js, dispatch 1792996565710-2027-92380cbc855570c5).
- codeinsight callers SecretField: total 0, codeinsight_index complete: true (dispatch 1792996530775-2001-6b654b99c8e7547e).
- codeinsight impact SecretField: total 0 (dispatch 1792996523633-1994-2c0de78bfee79e29).
- codesearch literal `SecretField` whole_word, all 4857 scanned files: 0 matches (dispatch 1792996529240-1998-df1b1ebaf4360f3b).
- codesearch literal `SecretField` in packages/client/ui-settings-plugins: 0 matches in 24 files (dispatch 1792996538292-2006-cf959478fe6aaaa2).
- codesearch literal case-insensitive `secretfield` and `secret-field`, all scanned files: 0 matches (dispatch 1792996705120-2116-4a31540162cc75cb, 1792996715724-2120-c5ac1e0ce220a9a7).
- gh search code `SecretField` in AnEntrypoint/freddie: `[]` (dispatch 1792996584133-2042-bd2211e087356a92).
- Caveat: the codesearch replies carry `complete: false, complete_reason: stale_tree` (local is 2 ahead, 22 behind upstream). Zeros are backed by the exhaustive literal scan and the upstream checks, not by the stale-flagged verdict.

## Helpers
- The deleted body used only `h` and `css`. Both are still used by `ValueField`, so no helper became unused.

## Facts the row relies on
- The acceptance end state (no SecretField export, no helper left unused) already holds in the local tree and on upstream main.
- The row's witness_plan clause "codesearch for SecretField returns only its definition" cannot hold: there is no definition left to return. Corrected in the row text (see 03-edit).

## Stale tree
- local HEAD 7bc6fe1f05da, ahead 2, behind 22 at upstream tip f8f3580ad77f (codesearch stale_tree).
