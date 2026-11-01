# 01-orient: gui-sticky-composer-focus-clearance-20261007

session: mcp-codemode-3535970-1793542718115-1-2
row: .gm/prd/gui-sticky-composer-focus-clearance-20261007.yml (status pending, session_id gui-dada-root-20261007, no acceptance field)

## acceptance (derived)
- clause: after Enter/Tab focuses the original gm_git_show OUT block (row: y653-819) from a native320 center-start scroll, the block is not occluded by the sticky composer seat (y604-844): the scroll alignment reserves the measured composer seat height (--freddie-composer-height).
- source: row subject, "Preserve measured composer seat clearance in native scroll alignment, real repeat from normal mid-scroll with nonempty draft and owner identities".

## codeinsight
- callers applyPendingScroll: 0 edges (edges are keyed by simple name; private #method unresolved).
- impact gm_git_show: 0 edges (the verb name is a string in a presenter, not a symbol).

## cited files (codesearch dual, read-verified where marked)
- packages/client/ui-trajectory/src/client/TrajectoryTable.js:2018 #applyPendingScroll (verified 2014-2075): virtualized path rowVirtualizer.scrollToIndex(align 'center'); non-virtualized path row.scrollIntoView({block:'center'}); no composer-height term.
- packages/client/ui-trajectory/src/client/TrajectoryTable.js:2053 #focusInspector: rAF, inspector.focus({preventScroll:true}), bounded by FOCUS_INSPECTOR_FRAMES.
- packages/client/ui-trajectory/src/client/TrajectoryTable.js:1229 queueMicrotask calls #applyPendingScroll then #applyTimelineFocus.
- packages/client/ui-conversation/src/client/skeleton/ConversationRoot.js:27-35 (verified 1-60): #bindSeatObserver finds [data-composer-seat], ResizeObserver sets --freddie-composer-height on seat.parentElement from seat.offsetHeight.
- packages/client/ui-conversation/src/client/chat/ChatView.js:30 pagingAnchor reads [data-composer-seat] inside the scrollport (snippet only).
- packages/client/ui-conversation/src/client/chat/ChatView.js:363 #follow, :373 #onScroll (snippet only).
- packages/gm/tool-gm/src/verbs.js:322 presentCall 'gm git_show' (presenter only, no focus logic).

## history (commits, codesearch)
- d8e3e141 fix(trajectory): move focus to the inspector after Inspect; note .agents/notes/implemented/bug-fix/2026-10-16-trajectory-inspect-focus.md (Event details pane tabIndex -1; focus retried for FOCUS_INSPECTOR_FRAMES).
- be52bc88 docs(agents): composer and chat seat witnesses, .agents/notes/implemented/architecture/2026-10-13-composer-and-chat-seat-witnesses.md.
- 8b49b4c2 / e7886238 composer re-render narrowing notes (architecture/2026-10-13-composer-zone-narrowing.md, outlet-default-subscriptions.md).

## facts the row relies on
- F1: the seat height variable is written only on the composer seat's parent scroller (ConversationRoot.js:35).
- F2: the trajectory scroll alignment (TrajectoryTable.js:2018-2040) uses center alignment with no composer term.
- F3: whether TrajectoryTable's scroller is the same scroller that receives --freddie-composer-height is NOT established here (ELIMINATE).
- F4: whether the gm_git_show OUT block lives in the chat (ChatView) or the trajectory table is NOT established here (ELIMINATE).

## unknowns carried to gm-unknowns
- U1 which scroller hosts the Inspect focus target (chat ChatView vs TrajectoryTable).
- U2 whether --freddie-composer-height is consumed anywhere in the scroll path.
- U3 the exact live rect of the OUT block and seat at native320 center-start (live run).
