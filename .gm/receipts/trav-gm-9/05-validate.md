# 05-VALIDATE: trav-gm-9

session (witness): orch-fin-1792994560-7712-3-v1 (the executor session, orch-fin-1792994560-7712-3, does not witness its own edit)
row: trav-gm-9
acceptance: Drop the alias and use `block` directly in the branches.
witness_plan (row text): GUI bubble with text and an image, before and after. See residual.

## Expected values (written before the runs)

- C1 `const b = block` absent from `MessageItem.js`: codesearch literal, 0 matches.
- C2 no `b.type`, `b.text`, `b.attachment` left in `computeContentParts`: codesearch regex `\bb\.(type|text|attachment)\b`, 0 matches.
- C3 probe on the edited tree equals `/tmp/gm-trav-9/baseline.json` byte for byte (text `hello world`, image `img-1`, align `end`).
- C4 two-sided: a mutant that drops the image attachment (`images.push({ attachment: undefined })`) makes the probe output differ from the baseline. A guard that cannot fail is decoration.

## Observed

- C1 PASS: `codesearch` literal `const b = block` on `MessageItem.js` = 0 matches (dispatch 1792995800783-1292-ef34f312ed6bf623).
- C2 PASS: `codesearch` regex `\bb\.(type|text|attachment)\b` = 0 matches (dispatch 1792995801617-1294-3702b5355192b8dd).
- C2 positive control: literal `for (const block of content)` = 1 match at line 42 (dispatch 1792995816114-1323-65cc1b7428c0e3d4); regex `\bblock\.(type|text|attachment)\b` = 6 occurrences on lines 43-45 (dispatch 1792995816948-1326-75f5e53b73425b91). The probes detect the pattern they claim to.
- C3 PASS: probe on the edited tree equals `/tmp/gm-trav-9/baseline.json`: `equal: true` (witness dispatch 1792995827564-1342-522fb01e2739104, session `orch-fin-1792994560-7712-3-v1`, exit 0).
- C4 PASS (two-sided): mutant dropping the image attachment gives `images: [{}]` against the baseline `[{"attachment":{"id":"img-1"}}]`; `mutantDiffers: true`; the mutant file was removed (`mutantLeft: false`). Same dispatch.
- Witness line appended to `.gm/witness-log.md`.

## Residual

- The row's `witness_plan` (GUI bubble with text and an image, before and after) was not run. The fact only a browser supplies is the painted DOM. The vnode the bubble renders is identical pre and post (C3), so the browser run would repaint an identical tree. Not run here: browser lease and a live boot.

## Result

STATUS: verified 1792995827564-1342-522fb01e2739104 (C1-C4 pass; GUI residual named).
