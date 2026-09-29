# AGENTS.md — frontend-static

## Rationale

- `src/index.js` traversal guard: the resolved target must equal `distRoot` or start with `distRoot + sep`. `sep`, not `'/'`: `resolve()` emits backslash paths on Windows, and a `'/'` suffix would reject every legitimate subpath.
- `src/index.js` assets are served `no-cache` with the shared ETag/Last-Modified validators (filenames carry no content hash), so a warm load revalidates with a 304.
- `src/index.js` only absent/non-file index errors (`STATIC_MISS_CODES`) become 404; other filesystem failures reach the webserver's request-failure handling. As the fallback owner it answers 405 to non-GET/HEAD without a named route (named routes own their own methods).
- Behavior contract: readable index at the dist root and configured index path; missing 404, traversal 403, unknown extensions octet-stream, HEAD same headers as GET with no body. Every index response runs through the webserver index render (structured injection rows, then raw taps). `distIndex` is workspace knowledge of the composing app, typically a `!!js` expression, never hardcoded by a deployment.
- `src/invariant.js` asserts nothing: the fallback seat cannot be probed from the teardown stream (`internal/plugin` fires before the disposing fiber's effects run, so the legitimate owner still holds the seat and any claim probe false-positives on every correct disposal, unlike the webserver companion's reserved-path probes).
