# client-css-manifest

## Rationale

- `scripts/generate-manifest.mjs` regenerates `src/manifest.js` from `git ls-files '*.css'`, excluding `lib/` build output and `vendor/` copies: `vendor-modules` links vendor CSS itself so its relative font URLs resolve. It resolves the repo root from its own location, so it runs from any cwd. Regenerate after adding or removing a converted CSS file; never hand-edit `manifest.js`.
- `CssManifest` (`src/index.js`): per-file routes carry no hashed filenames, so they revalidate (`no-cache`) and the shared ETag/304 path keeps a warm load from re-downloading. The bundle's `rev` query IS the content hash, so a URL naming the current rev never changes meaning and is `IMMUTABLE`; any other rev revalidates.
- `invariant.js`: there is no runtime invariant to check. The package serves a static CSS-file manifest and injects stylesheet links into the page head; it owns no session events or mutable logged relation, so the registered installer is a deliberate no-op.
- `src/index.js`: serves one concatenated `/styles/app.css?rev=<12-hex content hash>` in manifest order (the one link the page carries) plus each file at `/styles/<id>.css` for debugging; each concatenated part is prefixed with a `/* <id> */` line in the served output. It provides `ctx.cssManifest` so HMR can publish the new rev and the browser swaps the link. State rebuilds only when a manifest file's size or mtime moved (one `statSync` per file per check).
