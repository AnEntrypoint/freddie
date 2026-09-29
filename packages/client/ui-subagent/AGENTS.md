# AGENTS.md — ui-subagent

## Rationale

- `src/client/SubagentHeaderLineage.js` `descendantCount`: the catalog can arrive before the session-list baseline, so the count never falls below the already-visible direct rows (`Math.max(healthy.length, descendants.count)`).
- `src/client/SubagentHeaderLineage.js` `summaryBackedLoading`: session summaries can announce membership before the descriptor-backed catalog catches up. The entry point stays visible through disabled loading rows; only catalog rows are navigable.
- `src/client/SubagentHeaderLineage.js` `visible`: visibility needs evidence of children (entries, summary-known descendants, or a failed load worth retrying). A bare loading catalog is not evidence, because selecting any session schedules a refresh whose loading snapshot would flash the action in and out on childless sessions.
- `src/client/SubagentHeaderLineage.js` `FreddieSubagentHeaderLineage`: `freddie-catalog-dropdown` children are created, updated, and removed imperatively. webjsx `JSX.IntrinsicElements` only covers built-in tag maps, so an unregistered custom-element tag cannot be authored as JSX. The children release their own listeners in their own `disconnectedCallback` when removed, so the host's `disconnectedCallback` is intentionally empty.
- `src/client/SubagentHeaderLineage.js`: both elements are webjsx custom elements; portaled catalogs are a directly appended `document.body` child div kept in sync via `applyDiff` (Menu.tsx portal-mode pattern). `FreddieSubagentHeaderLineage` reads the derived `parentId` (a `useSessions` selector) directly in `#render()` and keeps its one or two dropdown children in sync via `setProps`.
- `src/invariant.js`: no runtime invariant. It is a single slash-source registration disposed by the registry; it emits no cordis events and owns no cross-plugin mutable state.
