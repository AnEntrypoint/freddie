# AGENTS.md — webserver

## Rationale

- `src/index.js` request entry: `/__hmr/<rev>/...` is rewritten to the unprefixed path before route matching so named routes and the fallback owner see one tree (the prefix is only a browser module-cache key). The `handle()` rejection guard logs and answers 400 so one malformed request (bad %-escape, client dropping mid-body) never becomes an unhandled rejection that kills the process.
- `src/index.js` teardown: Node's `closeAllConnections()` excludes upgraded sockets, so the service tracks and destroys them itself.
- `src/injections.js`: every JSON embedded in a `<script>` escapes `<` (`<`) so a row-controlled string cannot break out of the element.
- `src/injections.js` import maps: `importmap-entries` rows render once, merged, ahead of all other rows (a document may hold one `<script type="importmap">`, and it must precede module scripts). Two contributors mapping one specifier to different URLs is a composition bug and throws; the same contributor repeating an entry (rescan) is fine.
- `src/injections.js` `renderIndexInjections`: head rows are prepended when `<head>` is absent (headless fixtures); body rows are appended when `<body>` is absent (fragments).
- `src/invariant.js`: register/dispose of a reserved probe path twice; if dispose leaves the route behind the second register throws the duplicate error.
- Activation listens immediately; route registration order does not matter (named routes must be distinct), and the fallback answers 404 for anything unclaimed until its owner registers. A listen failure rejects init. Duplicate (kind, path) routes, duplicate upgrade paths (one socket, one protocol owner) and a second fallback all throw. Prefix table is longest-prefix-wins after an exact-table miss.
- Index render: structured `webserver/index-inject` rows gathered fresh per call (live module graph/theme), then raw `tapIndex` transforms in registration order.
- `src/static-file.js`: one open handle supplies file bytes and metadata; `etagOf(body)` hashes the delivered bytes, including equal-size edits with unchanged timestamps. Only `If-None-Match` validates a cached response; timestamp-only requests receive current bytes. Compression uses bounded content-hash caches, distinct encoding validators, and `Vary: Accept-Encoding`. Non-absent filesystem failures propagate to request-failure handling.
