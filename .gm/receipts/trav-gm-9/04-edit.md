# 04-EDIT: trav-gm-9

session: orch-fin-1792994560-7712-3
row: trav-gm-9

## Changed paths

- `packages/client/ui-conversation/src/client/chat/MessageItem.js` (in `computeContentParts`, lines 42-46)

## Change

- Removed `const b = block` (line 43).
- Text branch and image branch read `block` directly (`block.type`, `block.text`, `block.attachment`).
- `rest.push(block)` and every other line unchanged. No signature, export or return shape changed.

## Pre-edit checks

- Unknowns: all five `trav-gm-9-u*` resolved (`witnessed`). The one open unknown in the store belongs to another row.
- `callers computeContentParts`: 1 caller (`contentParts`, `MessageItem.js:32`). `callers contentParts` for the `MessageItem.js` definition: `UserStyleBubble` only.

## Post-edit checks (this run)

- `node --check` on the file: ok.
- Node probe `/tmp/gm-trav-9/probe.mjs` on the edited tree: output byte-identical to the pre-change baseline `/tmp/gm-trav-9/baseline.json` (`images` `[{"attachment":{"id":"img-1"}}]`, `align` `end`, text `hello world`).
- `codesearch literal "const b = block"` on the file: 0 matches (dispatch 1792995754820-1243-f8b8419924a6d070).
- `git_diff` scoped to the file (dispatch 1792995752867-1239-f4bb74461a9851ae): the 3-line hunk at `@@ -40,10 +40,9 @@`.

## Notes

- Shell `grep -n` was run once in Bash for the alias pattern (exit 1, no match). Worker rules forbid shell grep; the gm codesearch above is the sanctioned check.
- The GUI witness in the row's `witness_plan` is not run (see `03-eliminate.md` residual); the vnode-level probe is the witness.

## Next

`Skill(skill="gm-validate", args="row=trav-gm-9; session=orch-fin-1792994560-7712-3")`
