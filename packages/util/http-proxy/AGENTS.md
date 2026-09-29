# AGENTS.md — http-proxy

## Rationale

- `install.js` env restore: snapshot EVERY proxy name before writing any. Windows folds environment names case-insensitively, so reading the uppercase spelling after writing the lowercase one would read back the policy just written and restore it instead of the user's environment.
- `install.js` pool factory: replaces undici's default wholesale; that default builds a bare `Client` only at `connections: 1`, which this dispatcher never carries, so `new Pool(origin, options)` matches it.
- `install.js` direct policy over an installed one: the previous agent must be displaced as global dispatcher, otherwise plain `fetch()` keeps tunnelling while `proxyForUrl()` reports direct and `mode: 'off'` is a silent no-op. With nothing installed there is nothing to displace.
- `install.js` child environment: the install underneath published its normalized policy into `process.env`, which spawned children copy. With no policy active the user's own values return for the window and the outer install's come back when it ends; an install that proxied nothing published nothing to restore.
- `install.js` overlay: naming a scheme in either casing claims it, so the child gets exactly what the user wrote, in their casing, instead of a derived value.
- `policy.js`: `::ffff:127.0.0.1` and `::ffff:7f00:1` are one address (a URL may normalize the dotted tail to two hex groups); `URL.hostname` keeps IPv6 brackets while bypass entries may omit them, so both sides are unbracketed before comparing; HTTPS falls back to the HTTP proxy last (as undici does) but never past an HTTPS value the user named and this package refused.
