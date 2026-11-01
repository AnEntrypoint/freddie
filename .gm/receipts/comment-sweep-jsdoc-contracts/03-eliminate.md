# 03-eliminate: comment-sweep-jsdoc-contracts

Each unknown in 02-unknowns.md is eliminated by a live run. The instrument is a literal `/**` scan through the code-search port, with the line-start test applied to the returned match text. A positive control confirms the test sees real starts.

## Positive control (the instrument moves)
- `packages/client/**/*.js` including `vendor-modules/vendor`: 159 matches whose text starts with `/**` (reply capped; the scan reports `truncated`). The same test on first-party scopes gives 0. So the test does detect real block starts.

## jsdoc-block-starts-first-party: eliminated, NO
- Literal `/**` over `**/*.js` excluding `**/vendor*/**`: 220 occurrences, 145 lines, 18 files of 1701 scanned. Dispatch 1793543142385-203-22b620e6cccdb7ab.
- Per-group scans (one codemode call, 10 globs: `scripts`, `packages/api`, `context`, `core`, `extensions`, `gm`, `goal`, `interaction`, `feedback`, `fs`): 145 entries, 0 with text starting `/**`. Per-group scan dispatch ids were not retained.
- `packages/client/**/*.js` excluding `**/vendor-modules/vendor/**`: 0 occurrences in 635 scanned. Dispatch recorded in the same codemode call.
- `framework/**/*.js`: 0 `/**` starts (the `export` control returned 196 matches, so the glob matches). `native/`, `examples/`: 0 entries. `packages/bundle`: 0 in 17 files.
- Note: the scans report `exhaustive:false` with `exhaustive_scope`. The only file in scope that the tool skipped is the minified `design-platform.css.js` (see below).

## jsdoc-literal-hits-are-data: eliminated, YES
- The 145 lines are JSON-keyed `"jsDoc": "/** ... */"` fields in `typert.host.js` files (`packages/api/*`, `packages/context/*`, `packages/extensions/cordis-host-runner`, `packages/goal/goal`, `packages/interaction/commands`, `packages/feedback/message-feedback`, `packages/gm/gm-client`); a `slot-catalog.js` string table (44 entries); `packages/core/tools/src/ts-types.js:16`, a template that emits `/** ... */` into generated types; `packages/fs/tool-fs-search/src/glob.js:161`, a description string; and `scripts/*` quoted strings.
- Read of `packages/extensions/cordis-host-runner/src/typert.host.js:775`: `"jsDoc": "/** Registry and cross-page router behind the two model-facing inspect tools. */",` inside a data object.
- Consumers: `jsDoc` is read by `packages/typert/loader/src/index.js` and `packages/extensions/tool-cordis/src/api-catalog.js`. Dispatch 1793543399546-648-fa084055112f5ee0.
- These are contract text for the typed Remote surface. Moving them to a README would remove them from the emitted surface, so they stay.

## vendor-jsdoc-out-of-scope: eliminated, YES
- `packages/client/vendor-modules/package.json` description: "Serves the vendored ESM copies of every bare-specifier npm package the client bundle imports at runtime...". Dispatch of the vendor-mentions scan: 1793543343266-517-bd4a0677544f9f83.
- `packages/AGENTS.md` (Source contracts): "Preserve executable shebangs, legal notices, upstream dependency source and frozen archives."
- The vendored set includes third-party packages (micromark, mdast-util-*, unist-util-*, shiki, oniguruma, anser, markdown-table, hast-util-*) and copies of `@freddie/cordis@4.0.1` and `@freddie/cordis-plugin-loader@1.0.2`. Comments there belong to the upstream source.

## row-premise-counts-reproduce: eliminated, NO
- The row's "281 JSDoc starts across 77 files" is not reproduced in any first-party scope. Non-vendor first-party gives 0 starts in 0 files. The vendor scope gives at least 159 starts (reply capped), so the pre-scan most likely counted vendored third-party comments.

## minified-css-js-unscanned: eliminated, NO (by direct read)
- The scan skipped `packages/client/ui-theme/src/styles/design-platform.css.js` (`searched_zero_files`, dispatches 1793543435811-724-e518e6504845fe75 and 1793543436340-727-5deef61f91f18eae). A direct Read shows the file is one `export default "..."` string of CSS custom properties with no `/*` or `/**`.

## Friction found (for the gm agent, INVARIANT 2)
1. `comment_audit` ignores `path`, caps `findings` at 2000, and lists `.agents/` markdown first. JS-only sweeps cannot reach `packages/` through it. Dispatch 1793543307894-423-1c2287b99b6ec33e.
2. The skill names the verb `mutable-add`, but the verb is `unknown-add` and needs an explicit `id` (`{id, value, status}`). The refusal says so. Dispatch 1793543424426-697-3b1c8b8e8cafd1a2.
3. `codesearch` `mode:"regex"` returned `unproven_zero` for `^\s*/\*\*`, while literal mode worked. Dispatch 1793543155533-207-31e58e19c2007e27.
4. The store lane was contended: `store_busy` and `dispatch_starved_waiting_for_serial_lane` waits of about 2 minutes before a re-dispatch succeeded.

## Verdict
All five unknowns are eliminated with live runs. The row's Pre premise is stale for first-party source: there are no first-party JSDoc block comments to move. The row's Post is satisfied vacuously for first-party source, and the non-vendor JSDoc-looking text is contract data. No file requires an edit, so EDIT is a receipts-only change.
