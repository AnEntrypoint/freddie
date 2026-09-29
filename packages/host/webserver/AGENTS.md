# AGENTS.md — webserver

## Rationale

- `src/index.js` request entry: `/__hmr/<rev>/...` is rewritten to the unprefixed path before route matching so named routes and the fallback owner see one tree (the prefix is only a browser module-cache key). The `handle()` rejection guard logs and answers 400 so one malformed request (bad %-escape, client dropping mid-body) never becomes an unhandled rejection that kills the process.
- `src/index.js` teardown: Node's `closeAllConnections()` excludes upgraded sockets, so the service tracks and destroys them itself.
- `src/injections.js`: every JSON embedded in a `<script>` escapes `<` (`<`) so a row-controlled string cannot break out of the element.
- `src/injections.js` import maps: `importmap-entries` rows render once, merged, ahead of all other rows (a document may hold one `<script type="importmap">`, and it must precede module scripts). Two contributors mapping one specifier to different URLs is a composition bug and throws; the same contributor repeating an entry (rescan) is fine.
- `src/injections.js` `renderIndexInjections`: head rows are prepended when `<head>` is absent (headless fixtures); body rows are appended when `<body>` is absent (fragments).
- `src/invariant.js`: register/dispose of a reserved probe path twice; if dispose leaves the route behind the second register throws the duplicate error.
