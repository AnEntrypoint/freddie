# AGENTS.md — frontend-static

## Rationale

- `src/index.js` traversal guard: the resolved target must equal `distRoot` or start with `distRoot + sep`. `sep`, not `'/'`: `resolve()` emits backslash paths on Windows, and a `'/'` suffix would reject every legitimate subpath.
- `src/index.js` assets are served `no-cache` with the shared ETag/Last-Modified validators (filenames carry no content hash), so a warm load revalidates with a 304.
- `src/index.js` only absent/non-file index errors (`STATIC_MISS_CODES`) become 404; other filesystem failures reach the webserver's request-failure handling. As the fallback owner it answers 405 to non-GET/HEAD without a named route (named routes own their own methods).
