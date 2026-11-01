# 03-eliminate: gui-sticky-composer-focus-clearance-20261007

session: mcp-codemode-3535970-1793542718115-1-2

## u2 known (mutable-resolve filed, row cleared)
- expected (from the row contract): the composer seat height reaches the scroll alignment of the surface that hosts the Enter/Tab target.
- observed: --freddie-composer-height is consumed as scroll-padding-block-end on .freddie-conversationRoot__scrollBody (ConversationRoot.css:227; the element that receives the var at ConversationRoot.js:36), plus ChatView.css:133 (toBottom slot bottom), and views.css:39 derives --freddie-trajectory-bottom-clearance used only as padding-bottom on .freddie-trajectoryTable__tablePane (TrajectoryTable.css:21). The trajectory pane has no scroll-padding rule.
- dispatch: 1793543391324-630-4ad9a152237bea1f, 1793543408843-661-c7b78c17f2e5f2b3, 1793543395654-639-1594e1d77dd2cc55, 1793543396235-641-368f65681eb47e4c, 1793543396505-643-19dc5f3941679830.

## u4 partially answered, stays open
- observed: TrajectoryTable.js applyPendingScroll (2018-2040) issues rowVirtualizer.scrollToIndex(align 'center') on the virtualized path and row.scrollIntoView({block:'center'}) on the plain path; no scrollPaddingEnd option is set in TrajectoryTable.js (only vendor @tanstack has it). #focusInspector (2053) passes preventScroll true.
- open: the native Enter/Tab focus scroll is not issued by repo code in these paths; whether it honours the ancestor scroll-padding is a layout fact (u3).
- dispatch: 1793543433644-717-b79c251985194524, 1793543304533-417-35fa363eee2f9bb6.

## u1 partially answered, stays open
- observed: the trajectory view is registered in the conversation.session slot (ui-conversation apply.js:198, rendered by ConversationRoot.js:68 inside .freddie-conversationRoot__scrollBody). So the trajectory tablePane nests inside the scroller that carries scroll-padding-block-end.
- open: which scroller actually hosts the OUT focus target and where its rect falls is a layout fact.
- dispatch: 1793543586590-880-87ddc6642cee6699, 1793543588994-882-e5f8ef8642e4b0ee.

## u3 cannot run here (live geometry)
- question: at native320 center-start with a nonempty draft, do the OUT block rect and the composer seat rect overlap after Enter/Tab; only a layout engine supplies the rects.
- check attempted: boot of the Freddie web profile (node apps/cli/src/bin.js web) fails before any page exists: Cannot find package 'commander'; root node_modules has 0 entries. Dispatch 1793543581002-869-451a527e5fd45f24 (boot_exit=1). Bash attempt log: /tmp/mcp-codemode-3535970-web-boot.log.
- no Freddie host listens on this box: ports 3000 and 3001 answer as unrelated nginx (gm fetch dispatches 1793543491987-818-ed7f4352e0194771 and 1793543492266-819-1e3624f662578804, 401 and 400).
- reason it cannot run here: the checkout has no installed dependencies, and installing them in the shared checkout is outside this lane. A headful browser is available (DISPLAY :1.0) and the browser lease is free.
