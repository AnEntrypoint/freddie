// Browser-build stub for the `dotenv` package.
//
// Why this exists: dotenv is a Node-only `.env`-file reader. Its real
// implementation is bundled by vite (dotenv has no browser/ESM export map
// entry, so vite pulls in its CJS source), and that source calls
// Node builtins (`path.resolve`, `fs.*`, `os.*`, `crypto.*`) at both
// module-eval time and inside `config()`. vite.browser.config.js already
// externalizes `node:*` specifiers, but dotenv imports them as bare
// `path`/`fs`/`os`/`crypto` (not `node:path` etc — see its own package.json
// `browser` field, which vite's default resolution follows), so vite's
// browser-external handling substitutes a placeholder
// `require___vite_browser_external` that returns `{}` for each. dotenv's
// bundled code then calls `path.resolve(...)` on that empty object and
// throws `TypeError: path.resolve is not a function` the moment
// loadDotenvOnce() (src/host/index.js) actually invokes `dotenv.config()` —
// even though that call is now lazy (gated behind first host()/bootHost()),
// laziness alone doesn't help once it fires.
//
// A browser tab has no `.env` file and no real filesystem to read one from,
// so dotenv has zero meaningful work to do here. This stub replaces the
// entire package for the browser bundle only (aliased in
// vite.browser.config.js; the Node CLI/server build is untouched and keeps
// importing the real `dotenv` package with real .env parsing).
//
// Shape matches dotenv's real `config()` return value closely enough that
// no caller breaks: real dotenv resolves to `{ parsed: {...} }` on success
// or `{ error }` on failure. loadDotenvOnce() (src/host/index.js) discards
// the return value entirely, so `{ parsed: {} }` (an always-succeeds,
// nothing-parsed result) is a safe, non-throwing substitute.
export function config() {
    return { parsed: {} }
}

export default { config }
