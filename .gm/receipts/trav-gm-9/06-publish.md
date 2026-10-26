# 06-PUBLISH: trav-gm-9

session: orch-fin-1792994560-7712-3 (CI read: orch-fin-1792994560-7712-3-c1)
row: trav-gm-9

## Delivery

- commit: `5353f42039d845d69528a4cd901d22fbf81a7730` on `AnEntrypoint/freddie` `main`, parent `dd598847971ed8180cb3d062c76933fc4d51f751`.
- content: `packages/client/ui-conversation/src/client/chat/MessageItem.js` only (blob `4e3807b04a557c75e13fcf4a3221a063dd335a39`, mode 644). Byte-identical to the local edited file (`cmp`).
- author: lanmower, no trailers. Body states the change only.
- later remote tip: `main` moved past this commit (other lanes pushed on top; `compare 5353f420...main` = ahead 2, behind 0, so this commit is an ancestor of main).
- CI: `ci-status` on the sha: publint success 1/1, run `40279777730`, `run_status: success` (dispatch 1792996062733-1594-98764043e4916d41). `log_sha256` of `ci-log {sha, max_lines:40}` reply minus its `dispatch_id:` line: `0820fa70db2d5634551203f3930fe5e2c5fbdcd5dadb740f64969ebf36ce546c`.

## Route

- Shared-tree publish via the Git API (gm-orchestrate, Shared-tree publish), not `git_finalize`: the work tree had other lanes' dirty paths. Steps: `gh api` remote tip, blob from remote content with the exact edit applied (equal to the local file), tree with `base_tree`, commit parented on the tip, PATCH `refs/heads/main` with `force: false`, then `cmp` of `?ref=main` against the local file.
- Route note: gm-publish step 2 names `git_finalize`; gm top-level and gm-orchestrate forbid it in a tree another lane writes. The Git API route was taken.

## Local tree (residual, not this row's)

- local `main`: ahead 2, behind 9 at the last `branch_status` (dispatch 1792996019484-1540-3930d8cde03fc6ce). The two ahead commits are another lane's (`7bc6fe1f`, `669d2fb6`).
- `git_pull` refused: `pull_blocked_by_local_changes` (dispatch 1792996035136-1553-b049d1d98782591d). Other lanes hold modified and untracked paths (`ui-commands/popup.js`, `ui-conversation/TodoPanel.js`, `ui-jobs/JobListAction.js`, `ui-primitives/DiffBlock.js`, `ui-primitives/index.js`, `use-copy-feedback.js`, `ui-settings-models/welcome-store.js`, `ui-workspace/rows/Rows.js`, `.gm/receipts/trav-gm-50` and `trav-gm-6`, `ui-primitives/assert-never.js`). Not committed or staged by this session.
- `MessageItem.js` in the work tree was restored to HEAD with `git_checkout` (dispatch 1792996032268-1551-80fecc9e561460c2). Its content on `main` is the published version above, so the restore loses no content from remote.
- Reconcile: the owning lanes commit their paths, then `git_pull` on `main` and `git_push` with `allow_foreign_commits`.

## Close

- `prd-resolve` and `prd-close` refuse with `close_commit_required`: the row needs a closing commit whose body carries `Row:`, `Witness:` and `Status:`. The receipts commit is that closing commit (`06-publish.md` lists it).
