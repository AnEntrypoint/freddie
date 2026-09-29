# AGENTS.md - ui-deliverables

Rules for this package. The package contract is in [README.md](README.md); the client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

Facts that a name cannot carry; each bullet names the file and symbol it belongs to.

- `mentions.forClosing` (`index.js`): returns a memoized resolver per `owner.turn`, revalidated by paths key, `seq` and `openFile`. `MarkdownText` compares `fileMentions` by identity, so a fresh object per call defeats its memo and re-parses every markdown block on each render. The chat view also memoizes per node (`cachedMentions` in `AssistantNodeView.js`) because `turn` itself is rebuilt by session snapshots.
- `#measuredKey` (`ProducedFiles.js`): `#measure` costs one forced reflow per candidate remainder label and `#remeasure` rebuilds the observer; only the paths move a chip, and this element re-renders on every store fanout (every keystroke), so both are skipped while the path list is unchanged. Compared by content because the caller rebuilds the array each render; reset on disconnect because a reconnect mounts fresh probes.
- `#remeasure` (`ProducedFiles.js`): the observer covers the row and the chip probes only. The remainder probe resizes solely because `#measure` writes its own `textContent`, so observing it feeds that write back into another `#measure` and loops until the browser's ResizeObserver loop guard cuts it off.

## Behavior notes

- `turn-deliverables.js`: produced files come from the mutation tools' follow-along `locations`, not the closing prose. A mutation is recognized by render intent (a diff card, or a generic card whose kind is `edit`), never tool name, so a new mutation tool joins by declaring what it does. Reads, deletes and failed calls contribute nothing; paths keep first-seen order and appear once; only root call views contribute (nested Code Mode dispatches do not). Turn membership is owned by the Conversation Location index, so this derivation never infers turn boundaries.
- Mention resolution: an inline-code token resolves by exact path or by being exactly the basename of exactly one produced path; a basename two paths share stays inert so a mention link never opens the wrong file.
- `index.js`: all policy (derivation, matching, chip cap `SHOWN_LIMIT`, copy) lives in this package, so removing it from cordis.yml removes both surfaces and the chat view renders an empty chain and inert prose.
- `src/index.js`: pure node half that registers the response-format guidance the browser half relies on; the browser half ships via `exports["./client"]`.
- `invariant.js`: no runtime invariant; registrations are effect-owned and the package owns no mutable state.
