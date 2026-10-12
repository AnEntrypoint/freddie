# ui-conversation and ui-trajectory dead code

Row: `freddie-ui-conversation-trajectory-weight`.

## Served bytes

Closure = JS files reached from each package's entry (`src/index.js`, `src/invariant.js`, `src/client/index.js`) through relative and package-name imports.

- ui-conversation closure: 324506 B -> 323880 B (-626 B). Unreached source: 3 B -> 0 B.
- ui-trajectory closure: 245089 B -> 245089 B (no change). Unreached source: 1975 B -> 0 B. Its removals were all files no entry reached, so none were served.
- Served CSS (concatenated by css-manifest from `git ls-files '*.css'`) across the six touched sheets: 58657 B -> 54765 B (-3892 B). HeroShell.css 3865 -> 2010, InputBar.css 8413 -> 8302, TrajectoryTable.css 44711 -> 44453, and the three removed trajectory sheets 534 + 245 + 889 -> 0.

## What was removed

Proof per item: zero code references repo-wide (word-boundary search over `.js`, `.mjs`, `.cjs`, `.html`, `.md`, `.json`, `.yml`, excluding `.agentplug-kv` and codeinsight caches), no string-keyed or template-keyed lookup, and no `import *` or dynamic import of the owning file.

- Unreached files (no importer, no path string): `ui-conversation/src/client/contract/{composer-submission,queue,views}.js` (1 B each, empty).
- Unreached component chain: `ui-trajectory/src/client/{TrajectoryGroupHeader,TrajectoryTurn,TrajectoryTurnHeader}.js` with their `.css.js` maps and `.css` sheets. The only importers were inside the chain. Their `css-manifest/src/manifest.js` entries were removed, matching what `scripts/generate-manifest.mjs` produces from the tracked CSS list.
- Dead declarations in reached files: `PLACEHOLDER` (input/machine.js), `coordinate` (conversation-nodes/common.js), `ConversationSessionHeader` factory (skeleton/ConversationSession.js). The custom element `freddie-conversation-session-header` stays defined.
- Dead CSS, selector class never present in any markup or css map: `HeroShell.css` rules for `headlineText`, `previewBadge`, `fishHitbox`, `workspaceRow`, `modalInput` and the `hero-fish-swim` keyframes they alone used; the matching keys were removed from `HeroShell.css.js`. `InputBar.css` `hlSegment` rule and key. `TrajectoryTable.css` `eventHeader` and `user` rules (no `css` map key).

## Kept on purpose

- `TrajectoryTable.css` `promptDiffLine*` rules: referenced via ``css[`promptDiffLine${line.kind}`]``.
- Export keywords on symbols used only inside their own file (for example `formatDuration`, `deriveStats`): removing the keyword saves no bytes.
- `Freddie*` custom element classes: registered through `defineElement`, a string-keyed lookup.
- `UnknownBlocks` (ContextBody.js) and `inputCellDetail`, `assistantTimingDetail` (trajectory): called from live code; the first draft of the sweep missed the `...name` call form.
