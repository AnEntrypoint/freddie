# @freddie/freddie-tool-fs-search

## Rationale

- `glob.js` excludes each VCS name with two negated globs: the bare form prunes the directory during traversal, the `/**` form still excludes contents when the search root is at or inside that directory (where the bare form, matched against root-prefixed paths, never fires).
- A glob result that fits under `maxResults` is shown whole in modification-time order (the tool's contract, which answers age questions).
- `grep.js` spill artifact holds the complete result (previewed per line, no inline cap) so the recovery file is the full search; `saveText` failures are best-effort: they never fail the search or hide the inline result, the footer reports the unsaved remainder.
- `search-core.js`: `spawn()` can throw synchronously (NUL in argv, abort between the check and the call, platform-package resolution), so the abort re-check after the catch is real despite static narrowing.
