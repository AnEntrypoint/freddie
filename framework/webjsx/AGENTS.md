## Rationale

Non-obvious reasons behind code in `framework/webjsx/src`. Divergences from upstream live in `framework/README.md` (Divergence log entries 20, 22), not here.

- `applyDiff.js` empty new child list: `parent.innerHTML = ""` runs only when the previous render had vnode children. A parent that never had nodes, or that manages its content through `dangerouslySetInnerHTML`, must not be cleared.
