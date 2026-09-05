# Cookbook: adding a vendored package

When the harness needs another upstream Cordis package (e.g. `@cordisjs/plugin-http`), it is **vendored** as pinned source under `vendor/`, not added as an npm dependency — see [the vendoring decision](../../.agents/notes/implemented/process/2026-06-11-vendor-cordis-as-source.md) for why. [vendor/README.md](../../vendor/README.md) covers *updating* an already-vendored package; this guide is the file-by-file checklist for adding a **new** one. (Verified against the existing vendored set; if it drifts, fix it here.)

Every vendored package ships as plain buildless JS — no TypeScript, no `tsconfig.json`, no per-package build config, no `lib/` output. `package.json` `main`/`exports` resolve directly to `src/index.js`.

## 1. Copy the source in

```
vendor/<dir>/
  package.json     # from upstream; set "private": true, rescope the name, keep exports/type
  src/              # the upstream src/, converted to plain JS (see below)
  README.md LICENSE # if upstream ships them
```

If upstream's source is TypeScript (the normal case — every package vendored here started that way), convert it to plain JS before it's usable in this repo:

- Delete type-only syntax entirely: `interface`/`type` declarations, `declare module`/`declare global` blocks, type-only imports/exports.
- Strip inline type annotations from parameters, return types, variables, and class fields; drop generic type parameters, type assertions (`as X`, `<X>`, `!`), and `satisfies` clauses.
- Convert `const enum`/`enum` declarations to plain frozen-shape objects with the same numeric values.
- Convert constructor parameter properties (`constructor(public x: X)`) to an explicit field declaration plus a `this.x = x` assignment at the correct point in the constructor body (before any other code that reads it; after `super()` in a derived class).
- Convert TypeScript declaration-merging (a namespace merging with a same-named class/function) into either a hoisted-function-then-attach pattern or a `static` class field, depending on whether the merge target is a function or a class; a namespace merging only with a type alias has no runtime target and converts as a standalone object instead.
- A namespace whose every member is a type (no `const`/`let`/`function`/`class`) disappears whole — nothing runtime-visible depended on it.
- Abstract classes keep their abstract methods as real methods that throw `not implemented`, relying on every concrete subclass to override them.

`vendor/README.md`'s local-modification entry 19 documents this conversion in full, with the exact patterns applied across the current vendored set — reference it directly rather than re-deriving the rules.

`package.json` invariants: `"private": true` (vendored packages are never published outside this monorepo), rescope the `name` ([mapping](../rescope.md)) while keeping upstream's `version`/`type`, point `main`/`exports` at `src/index.js` (a package needing a browser-vs-node split, like `logger-console`, uses a conditional `exports` map pointing each condition at its own `src/*.js` file — no separate build config), and list its cordis deps in `peerDependencies` (matching the upstream manifest). Transitive upstream deps must themselves be vendored or already present — vendoring one package often means vendoring its dependency tree (e.g. `@cordisjs/plugin-http` pulls `@cordisjs/fetch-file`).

Local relative imports/exports in the converted JS source use explicit `.js` specifiers (this repo's ESM convention for every workspace package, not vendor-specific).

## 2. Register it in the root configs

| File | Change |
|---|---|
| `vendor/README.md` | add a manifest table row (dir, npm name, version, upstream repo, commit SHA) and log any local modifications, including the TS→JS conversion itself if this is the package's first vendoring pass |
| `tsdown-resolver-paths.json` | add `"<npm-name>": ["./vendor/<dir>/src"]` if any `packages/*` consumer needs this vendored package resolvable for that build's own resolver-path facade |

Covered automatically by the `vendor/*` glob in `pnpm-workspace.yaml`'s `packages` list — no edit needed there for a new directory.

## 3. Mind the manifest log

`vendor/README.md`'s "Local modifications" section must stay exhaustive — log every divergence from upstream there, including the TS→JS conversion, in the same commit that adds the source.

## 4. Verify

```sh
pnpm install        # registers the workspace
```

Verify live: boot the real composition that depends on the vendored package and drive its behavior — e.g. `node apps/cli/src/bin.js --profile web --dump-config` exercises the full Loader/Include/cordis.yml chain end to end, or construct a real `Context` (`import { Context } from '@freddie/cordis'`), mount the new package as a plugin, and exercise its actual API with real inputs. No test files; this live-execution check is the whole verification step.
