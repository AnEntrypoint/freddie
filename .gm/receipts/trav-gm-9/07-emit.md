# 07-EMIT: trav-gm-9

- edit: exact-match `Edit` on `packages/client/ui-conversation/src/client/chat/MessageItem.js` (lines 42-46): alias removed, branches read `block`.
- diff (git_diff scoped, dispatch 1792995752867-1239-f4bb74461a9851ae): one hunk, `@@ -40,10 +40,9 @@`.
- witness through the live entry point: the real module, loaded by `node` (probe), dispatch 1792995827564-1342-522fb01e2739104. `node --check` ok.
