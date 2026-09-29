# client-ui-goal

## Rationale

- `FreddieGoalBar#persistentTooltip` (`src/client/GoalBar.js`): `h(Tooltip, ...)` runs the bare one-shot `Tooltip` factory synchronously, creating a fresh `freddie-tooltip` per call. This element re-renders on every goal or session snapshot, so an uncached tooltip is recreated each render and loses its in-flight hover-delay timer. The cache key is a stable per-call-site label (`'save'`, `'edit'`, ...) because a tooltip has no natural object identity here.
