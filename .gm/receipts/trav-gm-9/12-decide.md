# 12-DECIDE: trav-gm-9

- row words: "Drop the alias and use `block` directly in the branches." Checked against the file (C1, C2), not the diff.
- witness: `1792995827564-1342-522fb01e2739104` from session `orch-fin-1792994560-7712-3-v1` (not the executor session). RESULT PASS.
- row's witness_plan (GUI): not run; named as residual in `05-validate.md`.
- decision: the row closes on the node witness (vnode identity, C3, plus the mutant guard, C4). Default taken for the GUI witness: not run, because the browser lease and boot are out of scope for a no-behaviour-change refactor. Disclosed here and in the final report.
- push and CI: pending until publish.
