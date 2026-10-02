## Rationale

Non-obvious reasons behind code in `framework/webjsx/src`. Divergences from upstream live in `framework/README.md` (Divergence log entries 20, 22, 24), not here.

- `applyDiff.js` empty new child list: `parent.innerHTML = ""` runs only when the previous render had vnode children. A parent that never had nodes, or that manages its content through `dangerouslySetInnerHTML`, must not be cleared.
- `applyDiff.js` raw-node replacement: a cached child can name a parent that no longer lists it after an aborted diff. Replacing it throws and stops the rest of the render. A child whose parent is the live parent is replaced; a detached child is inserted at the new position instead.
