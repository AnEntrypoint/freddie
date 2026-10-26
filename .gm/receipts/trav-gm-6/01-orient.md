# trav-gm-6 — orient

session: orch-fin-1792994560-7712-8
row: trav-gm-6 (pending; `prd-list {"id":"trav-gm-6","full":true}`, dispatch 1792995137113-553-c49550eb1136677d)

## Row

- subject: A literal NUL byte is used as the turn/group key separator, a raw control character inside source where an escape belongs.
- description: Principle CLEANNAME (gm graph) at `packages/client/ui-trajectory/src/client/TrajectoryTable.js:324`.
- acceptance (row text): Replace the raw NUL with the `\u0000` escape, ideally via the shared key builder.
- witness_plan (row text): `git grep -I -c 'turn' HEAD -- <file>` still matches (the NUL sits past the first 8 KB); grouped rows must render the same after the escape rewrite.

## Cited line against the tree

- HEAD `0efe05d9`, branch `main`, `git_status` scoped to the file: `dirty: false`, 0 changed paths (dispatch 1792995175163-587-b4bff0157c23ec3c).
- Line 324 is `  return \`${turn}\u0000${group}\``. `sed -n 324p | od -c` shows the six ASCII bytes `\ u 0 0 0 0`, not a NUL byte.
- Raw NUL count in the working-tree file (`python3 -I`, byte count): 0.
- Remote `main` blob, `gh api .../contents/<file>?ref=main`: 108058 bytes, raw NUL count 0, escape-text count 1, line 324 identical.
- `codesearch` literal `u0000` scoped to the file: 1 match, line 324 (dispatch 1792995227967-643-85c7704aa9f5273e).
- `codesearch` dual, scoped to the file: literal matches 0; ranked neighbours include `requestKey` at :323 (dispatch 1792995344937-754-a71129a951176211).

## Symbol

- `requestKey(turn, group)` defined at `TrajectoryTable.js:323-325` (function_declaration).
- `codeinsight callers requestKey` (index complete: true; dispatch 1792995202962-613-8b1950c8c4503729): 7 edges, `indexRequestBoundaries` :330, `indexRequestNumbers` :353 :357 :361, `#render` :1807 :1852 :1953.
- `codeinsight impact requestKey max_depth 3` (dispatch 1792995207082-621-fb0f3837152e8ad2): reached `indexRequestBoundaries`, `indexRequestNumbers`, and `#render` (ambiguous, not expanded); tests_reached 0.

## Provenance of the escape

- `git_show 0312ec5d -- TrajectoryTable.js` (dispatch 1792995363477-773-ba3e821cc6ffea3e), commit 2026-10-16 21:58:25 UTC, hunk `@@ -321,7 +321,7 @@`: `-  return \`${turn}\u0000${group}\`` (raw NUL byte) → `+  return \`${turn}\\u0000${group}\`` (escape text). The message does not name this change.
- `git_show c5af9540` (dispatch 1792995349103-758-912dcad57106b38d) is the commit titled "write composite-key NUL separators as escapes". It touches five other modules (`assistant-timing.js`, `layout.js`, `trajectory-record.js`, `trajectory-snapshot-builder.js`, `trajectory-virtual-rows.js`), not `TrajectoryTable.js`.
- `0312ec5d` precedes HEAD (`git_log` on the file lists it as the latest touch).

## Facts the row relies on

- F1 (refuted): line 324 holds a raw NUL byte. Checked at HEAD, the working tree, and remote `main`: 0 raw NUL bytes in each.
- F2 (true): the escape `\u0000` is present at line 324 and is the only occurrence of the key separator.
- F3 (true): `requestKey` is the shared key builder the acceptance names; all four callers route through it.
- F4 (stale): the witness_plan premise that the NUL sits past 8 KB is no longer true at HEAD.

## Leader hypothesis (SPECIFY)

H1: after the change, `TrajectoryTable.js` contains zero raw NUL bytes, the separator is written as the `\u0000` escape inside `requestKey`, and the runtime key string is unchanged.

H1 is the acceptance state, stated as the row's post-condition. The pre-edit checks above show H1 already holds at HEAD. The row's own cause claim (a raw NUL at :324 needs replacing) is F1, which is refuted. No rejected hypothesis is being witnessed.

## Result

No edit is required by acceptance. The defect was fixed by `0312ec5d`. The remaining work is the witness that H1 holds at the published sha, and the receipt commit.
