# 02-UNKNOWNS: trav-gm-9

session: orch-fin-1792994560-7712-3
row: trav-gm-9

Recorded with `mutable-add` (dispatch ids in brackets).

1. `trav-gm-9-u1` [1792995523487-950-e741774cf905135b]: Which exports of `MessageItem.js` reach `computeContentParts` through `contentParts`, so the loop can be witnessed under node without a browser?
2. `trav-gm-9-u2` [1792995526581-957-a589a5ff8dddb554]: Does the current GUI bubble render both the text and the attached image for a message with a text block plus an image block (the row's before-state)?
3. `trav-gm-9-u3` [1792995527000-958-5afa0c89ad77efc1]: Does any other lane hold uncommitted or unpushed edits to `MessageItem.js` (publish-path collision)?

Not unknown (proven at orient): the alias line is `MessageItem.js:43`; `b` is used only at lines 44-46; `computeContentParts` has one caller.

Next: `Skill(skill="gm-eliminate", args="row=trav-gm-9; session=orch-fin-1792994560-7712-3")`
