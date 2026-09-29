# AGENTS.md — tool-lsp

## Rationale

- `src/render.js`: the model counts lines/columns from 1, the seam and protocol from 0.
- `src/render.js` relative path display: a `file:` URI does not carry its world's OS, so a leading `/X:` segment is read as a Windows drive; a POSIX workspace literally rooted at `/c:/...` would mis-render (display only; reads and edits use the exact URI). `fileURLToPath` failure (malformed escapes, authorities, encoded separators) yields `undefined`.
