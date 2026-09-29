# AGENTS.md - ui-deliverables

Rules for this package. The package contract is in [README.md](README.md); the client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

Facts that a name cannot carry; each bullet names the file and symbol it belongs to.

- `mentions.forClosing` (`index.js`): returns a memoized resolver per `owner.turn`, revalidated by paths key, `seq` and `openFile`. `MarkdownText` compares `fileMentions` by identity, so a fresh object per call defeats its memo and re-parses every markdown block on each render. The chat view also memoizes per node (`cachedMentions` in `AssistantNodeView.js`) because `turn` itself is rebuilt by session snapshots.
- `#measuredKey` (`ProducedFiles.js`): `#measure` costs one forced reflow per candidate remainder label and `#remeasure` rebuilds the observer; only the paths move a chip, and this element re-renders on every store fanout (every keystroke), so both are skipped while the path list is unchanged. Compared by content because the caller rebuilds the array each render; reset on disconnect because a reconnect mounts fresh probes.
- `#remeasure` (`ProducedFiles.js`): the observer covers the row and the chip probes only. The remainder probe resizes solely because `#measure` writes its own `textContent`, so observing it feeds that write back into another `#measure` and loops until the browser's ResizeObserver loop guard cuts it off.
