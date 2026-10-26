# 01-orient: trav-gm-38

session: orch-fin-1792994560-7712-21
row: trav-gm-38
row file: .gm/prd/trav-gm-38.yml (status pending, session_id gm-prd-refile-improvements-20261016)

## Row

- subject: currentSessionProvideInfo is exported but never referenced outside its definition.
- description: Principle NODELETE (gm graph) at packages/client/ui-renderer/src/client/session-provider.js:37. currentSessionProvideInfo is exported but never referenced outside its definition.
- acceptance (given, not derived): Delete the export and any helper only it uses.
- witness_plan: Open a session and switch between two sessions; rendering works unchanged, and codesearch for the name returns only its definition.

## Cited facts and their status

| Fact the row relies on | Result | Source |
|---|---|---|
| Symbol `currentSessionProvideInfo` is defined in session-provider.js | FALSE: no such symbol in the file | Read of packages/client/ui-renderer/src/client/session-provider.js (51 lines) |
| Line 37 holds the export | FALSE: line 37 is `const sessionProviderCache = new WeakMap()` | same Read |
| Symbol exists anywhere in tracked tree | 0 matches (literal, whole-word), 4832 files scanned | codesearch dispatch 1792996113083-1643-7de10ffa218badfd |
| Symbol exists, file-scoped | 0 matches in session-provider.js | codesearch dispatch 1792995989232-1511-319f1cf584345002 |
| Symbol callers / dependencies | 0 edges; codeinsight_index complete: true | callers 1792995981882-1503-6ce90e6ebb61ae19; impact 1792995981496-1502-626b4b4db813a78a |
| Upstream main carries the symbol | 0 hits (AnEntrypoint/freddie code search); upstream file content identical to local | gh api search/code (no dispatch id); gh api contents ?ref=main, upstream tip 49bea30a8fee |

Stale-tree note: local checkout is 2 ahead / 7-9 behind upstream main (fetched). The file is byte-identical at upstream main, so the stale state does not change the file-level finding. The whole-tree literal result carries `complete: false` (stale_tree) and is recorded as a zero with that caveat; the zero is confirmed by the file read and by upstream search.

## Exports actually present in session-provider.js

| Export | Line | Call edges (callers verb) | Note |
|---|---|---|---|
| currentSessionMaybeProvideInfo | 33 | 2 (dispatch 1792996084033-1619-e053e1e5c3e2703c) | called at line 43 inside sessionProviderFor (confirmed by Read) |
| maybeObservableHook | 10 | 1 (dispatch 1792996085684-1621-70daf4874766e21d) | |
| projectionHook | 20 | 1 (dispatch 1792996085747-1621-711060b83f9086a6) | |
| sessionProviderFor | 39 | 1 (dispatch 1792996085972-1622-5798f9150513d680) | |
| SlotAssemblyError | 3 | 0 call edges (dispatch 1792996084804-1620-d40880fda775994); whole-word literal across tree: 12 hits (dispatch 1792996111810-1642-e192dd00491f04b7), mostly docs/notes | class export; `extends`/`instanceof` references are not call edges |

No export in this file matches the row's stated shape (exported, unreferenced) under the name the row gives. The one call-edge-free export, SlotAssemblyError, is a public error class and is not the row's named symbol; choosing it would be a guess about the row's intent.

## Dual search

codesearch dual (dispatch 1792996027859-1549-3eb1ba1c9f1a479), path packages/client/ui-renderer:
- BM25: session-provider.js:33 `currentSessionMaybeProvideInfo`; :39 `sessionProviderFor`; :42-43 arrow using `currentSessionMaybeProvideInfo`; scoped-slots.js:454 and :553 (unrelated).
- Commits: session-provider-adjacent perf commits only; none names `currentSessionProvideInfo`.
- Vector channel: not returned (route_without_index).

## Acceptance evaluation

The acceptance "Delete the export and any helper only it uses" has no target: the named export does not exist. Deleting `currentSessionMaybeProvideInfo` would break sessionProviderFor (line 43). No edit is derived from the row as written.

## Derived facts for the next stage

1. The row's premise is stale: the symbol is absent in local and upstream trees.
2. The row's witness plan presumes a definition to be left as the only match; there is none to keep.
3. Next stage (gm-unknowns) must record these as unknowns and run live checks before any blocker is filed.
