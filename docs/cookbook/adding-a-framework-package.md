# Cookbook: adding a framework package

When the harness needs another Cordis-layer package (e.g. an HTTP plugin), it becomes a **framework package**: first-party source under `framework/`, owned and edited here, not an npm dependency. [framework/README.md](../../framework/README.md) describes the layer and what each package diverged into; this guide is the file-by-file checklist for adding a **new** one. (Verified against the existing framework set; if it drifts, fix it here.)

You may start from an existing open-source project's source rather than a blank file, and the package table records that ancestry. But from the moment it lands here it is ours: you convert it, you own it, and it is never synced from upstream again. There is no update procedure to keep it compatible with.

Every framework package ships as plain buildless JS — no TypeScript, no `tsconfig.json`, no per-package build config, no `lib/` output. `package.json` `main`/`exports` resolve directly to `src/index.js`.

## 1. Bring the source in

```
framework/<dir>/
  package.json     # set "private": true, rescope the name, keep exports/type
  src/              # the source, converted to plain JS (see below)
  README.md LICENSE # preserve the origin project's LICENSE
```

If the source you are starting from is TypeScript (the normal case — every package in this layer started that way), convert it to plain JS before it's usable in this repo:

- Delete type-only syntax entirely: `interface`/`type` declarations, `declare module`/`declare global` blocks, type-only imports/exports.
- Strip inline type annotations from parameters, return types, variables, and class fields; drop generic type parameters, type assertions (`as X`, `<X>`, `!`), and `satisfies` clauses.
- Convert `const enum`/`enum` declarations to plain frozen-shape objects with the same numeric values.
- Convert constructor parameter properties (`constructor(public x: X)`) to an explicit field declaration plus a `this.x = x` assignment at the correct point in the constructor body (before any other code that reads it; after `super()` in a derived class).
- Convert TypeScript declaration-merging (a namespace merging with a same-named class/function) into either a hoisted-function-then-attach pattern or a `static` class field, depending on whether the merge target is a function or a class; a namespace merging only with a type alias has no runtime target and converts as a standalone object instead.
- A namespace whose every member is a type (no `const`/`let`/`function`/`class`) disappears whole — nothing runtime-visible depended on it.
- Abstract classes keep their abstract methods as real methods that throw `not implemented`, relying on every concrete subclass to override them.

[framework/README.md](../../framework/README.md)'s divergence log entry 19 documents this conversion in full, with the exact patterns applied across the current framework set — reference it directly rather than re-deriving the rules.

`package.json` invariants: `"private": true` (framework packages are never published outside this monorepo), rescope the `name` ([mapping](../rescope.md)) while keeping the origin's `version`/`type`, point `main`/`exports` at `src/index.js` (a package needing a browser-vs-node split, like `logger-console`, uses a conditional `exports` map pointing each condition at its own `src/*.js` file — no separate build config), and list its cordis deps in `peerDependencies`. Dependencies the new package needs must themselves be in this layer or already present — bringing one package in often means bringing its dependency tree with it.

Local relative imports/exports in the converted JS source use explicit `.js` specifiers (this repo's ESM convention for every workspace package, not something specific to this layer).

## 2. Register it in the root configs

| File | Change |
|---|---|
| `framework/README.md` | add a package table row (dir, npm name, what it descended from, version, ancestor repo, fork point) and log the conversion in the divergence log |
| `tsdown-resolver-paths.json` | add `"<npm-name>": ["./framework/<dir>/src"]` if any `packages/*` consumer needs this package resolvable for that build's own resolver-path facade |

Covered automatically by the `framework/*` glob in `pnpm-workspace.yaml`'s `packages` list — no edit needed there for a new directory.

## 3. Mind the divergence log

[framework/README.md](../../framework/README.md)'s divergence log is the rationale record for code whose shape would otherwise surprise a later reader. Log the TS→JS conversion and any deliberate departure you make while converting, in the same commit that adds the source.

## 4. Verify

```sh
pnpm install        # registers the workspace
```

Verify live: boot the real composition that depends on the new package and drive its behavior — e.g. `node apps/cli/src/bin.js --profile web --dump-config` exercises the full Loader/Include/cordis.yml chain end to end, or construct a real `Context` (`import { Context } from '@freddie/cordis'`), mount the new package as a plugin, and exercise its actual API with real inputs. No test files; this live-execution check is the whole verification step.
