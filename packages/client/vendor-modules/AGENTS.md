# AGENTS.md — vendor-modules

## Rationale

- `scripts/generate-vendor.mjs` derives paths from `import.meta.url`, so any cwd works. `ENTRY_SPECIFIERS` contains direct imports; scanning their transitive dependencies adds every reachable bare specifier to the import map, including `@freddie/cosmokit` through Cordis/Loader.
- `zod` must remain first in `ENTRY_SPECIFIERS`, resolved from `packages/goal/goal`: browser `@freddie/*/remote` modules need it, and omitting it silently removes the import-map entry.
- `EMITTED_REWRITES` keeps only `en` in `zod/v4/locales/index.js`. Traversal scans rewritten text, so other locales are neither reachable, copied nor fetched. `v4/classic/external.js` calls `config(en())`; this reduces the Zod closure from 79 files to 28.
- Unicode escaping preserves parsed TextMate ranges in the `html`, `less`, and `swift` grammars and removes non-ASCII documentation characters in `markdown-table` and `micromark-extension-gfm-autolink-literal`. Every rewrite throws if unchanged, exposing incompatible dependency updates.
- The final assertion scans all on-disk `vendor/` files and `src/manifest.js`, including stale copies: generation never deletes. It rejects the generator's Asian-script pattern and files in `locales`, `locale` or `i18n` directories except `en` and `index`.
- `LIVE_WORKSPACE_PACKAGES` files are scanned but never copied; `src/index.js` resolves those four packages through workspace dependencies on each request. Other packages, including the first-party Cordis framework, use versioned vendor copies.
- `IMPORT_MAP_PROVIDED_ELSEWHERE` skips `client-modules` and its `/client` entry; that plugin owns their import-map URLs, so duplicates would conflict.
- `SPECIFIER_ALIASES` maps `webjsx` from `web/src/seed.js` to `@freddie/webjsx`; both keys share a URL and remain adjacent in insertion order.
- Existing versioned files reject content drift. Deleting an old copy permits regeneration, but clients retain cached `immutable` bytes until cache clearance; version changes avoid reusing an immutable URL.
- `resolverFor` resolves Shiki/languages through `ui-primitives` and Zod through `goal`, rather than an arbitrary installed copy.
- `packageDirOf` uses the last `node_modules/<pkg>` segment, or the nearest ancestor manifest matching the name for workspace links.
- `BARE_SIDE_IMPORT_RE` starts at a statement boundary (file start, `;`, `{`, `}` or newline); string arguments such as `updateError("import", ...)` must not become imports.
- `CJS_EXPORT_SHIMS` replaces Anser's sole trailing `module.exports = Anser;` with an ESM default export. Browsers cannot load CommonJS; other bytes are preserved apart from `EMITTED_REWRITES`.
- `node:` imports never enter traversal. Only `node:module` gets an import-map entry: generation writes its throwing stub. Cordis/Loader imports it on a branch browser boot never takes.
- `copyKatexAssets` preserves the versioned stylesheet/fonts layout for relative font URLs. `cssLinks` contributes stylesheet links because import maps cannot load CSS.
- `serveVendor` sends `no-cache` for all `@freddie/` paths and unversioned files such as the Node stub; other versioned paths are `immutable` to avoid repeated revalidation.
- `webserver/index-inject` contributes title/process HTML, import-map entries and stylesheet links; the webserver assembles them with other plugins' contributions.
- `renderProcessShim` supplies only `env`, `execArgv` and `versions.node` for Cordis/Loader's browser initialization. Only public `FREDDIE_CLIENT_*` environment values reach the page; `<` is escaped before script insertion.
- Vendored Latin-script KaTeX `scriptData`/fallback classes, CSS/LESS keywords and MDX emoji shortcodes remain: rewriting changes math rendering or highlighting.
- No runtime invariant: this plugin contributes routes and boot metadata without owning an event stream or mutable business data; verify serving and browser boot live.
