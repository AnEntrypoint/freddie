# AGENTS.md — Vendored Packages

This directory contains source-vendored copies of the Cordis framework and its foundation libraries. See `vendor/README.md` for the manifest, local-modification log, and the upstream sync procedure.

**Do NOT edit `vendor/*/src/` files casually.** Every local divergence from upstream must be logged exhaustively in `vendor/README.md` under "Local modifications." Source ships as plain buildless `src/*.js` (no `tsconfig.json`, no `tsdown.config.ts`, no `lib/` build output — `package.json` `main`/`exports` resolve straight to `src/index.js`); a sync from upstream TypeScript needs the conversion pass described in `vendor/README.md`'s local-modification entry 19 before the copied source is usable here.

When changes are unavoidable, follow the sync procedure in `vendor/README.md`.
