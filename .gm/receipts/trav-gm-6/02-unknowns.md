# trav-gm-6 — unknowns

session: orch-fin-1792994560-7712-8
input: `.gm/receipts/trav-gm-6/01-orient.md`

Each unknown is recorded with `mutable-add`. The orient receipt proves the file has no raw NUL and that the escape is present. It does not prove the two facts below.

- trav-gm-6-unknown-1 (dispatch 1792995424541-832-37e6ebf3bd8a1392): does the escape `\u0000` at `TrajectoryTable.js:324` evaluate to the same NUL-separated key string the raw-NUL form produced? Answers acceptance "replace the raw NUL with the `\u0000` escape" by runtime value, not by text.
- trav-gm-6-unknown-2 (dispatch 1792995425293-835-2857982fb6770788): does `TrajectoryTable.js` parse as ESM at HEAD with the escape line in place? Answers whether the post-state is valid source.

Not opened as unknowns, with the reason:
- Other raw control characters in the file: the orient receipt counts 0 raw NUL bytes over the whole file, locally and on remote `main`.
- Grouped-row rendering after the rewrite: no rewrite happens in this run; the rewrite landed in `0312ec5d` (orient receipt).
- The row's `git grep -I` witness premise: stale (orient F4); the acceptance does not depend on it.
