# 01-orient: comment-sweep-jsdoc-contracts

session: mcp-codemode-3535970-1793542718115-1-15
row: comment-sweep-jsdoc-contracts (route_family representation, status pending, SESSION_ID comment-sweep-1790669479148)

## Row
Subject (`.gm/prd/comment-sweep-jsdoc-contracts.yml`): "Pre: exhaustive first-party JS scan found 281 JSDoc starts across 77 files. Invariant: public contracts remain discoverable and accurate while source carries no explanatory prose. Post: every JSDoc contract is represented in the owning package README/AGENTS.md or eliminated where code states it, with imports/live paths preserved."

No file or symbol is named in the row. The row has no separate acceptance text.

## acceptance (derived)
- clause: "No first-party, non-vendored JS source file carries a JSDoc block comment; every JSDoc contract that is a real source comment is moved to its owning package README or AGENTS.md, or made self-explanatory code, with imports and live paths unchanged."
- source: the row's Post clause, restated as one checkable clause.

## codeinsight
- callers / impact: not run. The row names no symbol; the subject is a text class (`/**` block starts), not a function.

## codesearch (dual)
- `dual` for "@param @returns JSDoc contract" returned bm25 `skipped: route_without_index` and 1 nearest-neighbour row with `literal_matches: 0`. Dual mode does not locate `/**` text. Dispatch 1793543130907-199-2aed7a18ee1362ce.
- commits channel returned 20 commits, none about the sweep premise.

## codesearch (literal, the instrument used for the count)
- `/**` over `**/*.js` including vendor: 2039 occurrences, 249 files of 2029 scanned. Dispatch 1793543134735-200-3ea984b7595fdabb.
- `/**` over `**/*.js` excluding `**/vendor*/**`: 220 occurrences, 145 lines, 18 files of 1701 scanned. Dispatch 1793543142385-203-22b620e6cccdb7ab. Scan reports `exhaustive:false` with `exhaustive_scope`, plus 1 file skipped as minified (`packages/client/ui-theme/src/styles/design-platform.css.js`). That is the only unscanned file in scope.
- Regex `^\s*/\*\*` returned 0 with `unproven_zero`, so the zero is not a finding. Dispatch 1793543155533-207-31e58e19c2007e27. Literal mode was used instead.

## Facts the row relies on (each checked against the tree)
1. The pre-scan's 281 starts and 77 files are not reproduced in first-party source. Literal `/**` scans of non-vendor JS give 145 lines in 18 files, and every one is inside a string literal, not a comment. See 03-eliminate.md.
2. Non-vendor first-party groups with JSDoc-looking text: `packages/api/*` (typert.host.js jsDoc fields), `packages/context/*`, `packages/core/tools/src/ts-types.js` (TS emitter template), `packages/extensions/cordis-client-runner/src/client/slot-catalog.js` (44 string entries), `packages/extensions/cordis-host-runner/src/typert.host.js`, `packages/extensions/tool-cordis/src/api-catalog.js`, `packages/goal/goal`, `packages/gm/gm-client`, `packages/interaction/commands`, `packages/feedback/message-feedback`, `packages/fs/tool-fs-search/src/glob.js` (description string), `scripts/*` (quoted strings).
3. `packages/client/**` excluding `vendor-modules/vendor/**`: 0 JSDoc starts in 635 JS files.
4. `framework/**/*.js` has `export` matches (196), and 0 `/**` starts.
5. `packages/client/vendor-modules/vendor/**` holds third-party copies (micromark, mdast, shiki, unist, anser, markdown-table, and vendored @freddie/cordis and @freddie/cordis-plugin-loader). Its package.json describes it as "Serves the vendored ESM copies of every bare-specifier npm package the client bundle imports at runtime". `packages/AGENTS.md` says: "Preserve ... upstream dependency source". These JSDoc starts are out of scope. Count is at least 159 (capped read); exact count not taken.
6. The jsDoc field is consumed at runtime by `packages/typert/loader/src/index.js` and by `packages/extensions/tool-cordis/src/api-catalog.js`. Dispatch 1793543399546-648-fa084055112f5ee0.

## Verdict at orient
Premise stale for first-party source. The sweep's real target is empty; the JSDoc-looking text is contract data for the typed Remote surface and is consumed as data. Proceed to unknowns, eliminate, and a receipts-only edit.
