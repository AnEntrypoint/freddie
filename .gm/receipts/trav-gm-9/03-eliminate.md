# 03-ELIMINATE: trav-gm-9

session: orch-fin-1792994560-7712-3
row: trav-gm-9

Each unknown: expected value written from the row contract before its run, then observed.

## trav-gm-9-u1: which exports reach `computeContentParts`

- expected (contract): an exported entry point renders the content through `computeContentParts`, so a node run can witness the loop.
- observed:
  - `contentParts` callers (dispatch 1792995554640-995-abcc3de77318ddc4): `UserStyleBubble` at `MessageItem.js:255`, plus `llm-deepseek/src/serialize.js` entries. The `llm-deepseek` `contentParts` is a different function (`serialize.js:81-100`); `ambiguous_definitions: true`. The `MessageItem.js` blast radius is `UserStyleBubble` only.
  - `impact contentParts` depth 3 (dispatch 1792995570241-1008-332a91bd5a49b610): `UserStyleBubble` (252-278) and `serializeMessagesWithImages` (llm-deepseek). No test reached.
  - `UserStyleBubble` has no call edge (dispatch 1792995574141-1012-ee40c30e39010b85): it is referenced as `h(UserStyleBubble, …)` in `PendingSteeringBubble` (`MessageItem.js:281`, exported) and `UserMessageNodeView` (`MessageItem.js:301`, exported).
- result: known. Exported witness entry points: `PendingSteeringBubble` and `UserMessageNodeView`.
- note: the index was stale (`stale_tree` ahead 2, behind 2). Sync via `codeinsight {"action":"sync"}` (dispatch 1792995559440-997-174256aabfd9df0b) completed with `complete: true`.

## trav-gm-9-u2: does the GUI bubble render text and image (before-state)

- expected (contract): text `hello world` and image `img-1` both reach the bubble.
- observed (node, pre-change tree, Bash run, output in `/tmp/gm-trav-9/baseline.json`):
  `{"images":[{"attachment":{"id":"img-1"}}],"align":"end","hasJoinedText":true,"strings":["hello world"]}`
  Probe: `/tmp/gm-trav-9/probe.mjs`, content `[text 'hello', image img-1, text ' world', custom]`, `PendingSteeringBubble` called with a `document` stub.
- result: known at the vnode layer. The painted DOM was not run: a browser-only fact (the GUI witness of the row's `witness_plan`), recorded as residual below.

## trav-gm-9-u3: other lanes' edits to `MessageItem.js`

- expected: clean.
- observed (git_status scoped to the file, dispatch 1792995538205-974-182592fa6c0860f): `dirty: false`, `changed_paths: 0`, branch `main`.
- result: known.

## trav-gm-9-u4: local main diverged from origin/main

- expected after publish: ahead 0, behind 0.
- observed (branch_status dispatch 1792995591002-1031-4010e2d26d55ebb1): ahead 2, behind 2, fetch ok.
- ahead commits (git_log dispatch 1792995698971-1164-364c15b578cfd99d): `7bc6fe1f` (trav-gm-7 receipts, lanmower) and `669d2fb6` (plugin detail list, lanmower). Neither touches this row's file.
- route: publish stage, `git_pull` main, then `git_push` with `allow_foreign_commits:true` (stranded-publish rule).
- result: route decided; the post-publish `branch_status` is the check. Resolved here as a route, not as a witness.

## trav-gm-9-u5: upstream tip still carries the alias

- expected: `const b = block` at line 43 on remote main.
- observed (gh api raw, `ref=main`, one file, read to `/tmp/gm-trav-9/remote-MessageItem.js`): lines 42-44 are `for (const block of content) {`, `    const b = block`, `    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)`.
- result: known. The edit applies to the remote state.

## Residual (not witnessed here)

- Painted DOM for the GUI witness in `witness_plan` (text and image bubble in the browser). Reason: a browser lease and a live boot are needed; the row's change leaves the vnode output unchanged (witnessed below at the vnode layer), so the browser run would be a repaint check. Named in `04-edit.md` and the final report.

## Result

No unknown open. `trav-gm-9-u1`, `u2`, `u3`, `u5` resolved; `u4` resolved to a route with a post-publish check. Next: `Skill(skill="gm-edit", args="row=trav-gm-9; session=orch-fin-1792994560-7712-3")`.
