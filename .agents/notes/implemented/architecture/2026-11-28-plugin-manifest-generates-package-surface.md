# Agent Note: One plugin manifest owns the package surface

Status: implemented

## Problem

Each of 239 packages repeated the same `exports`, `main` and `files` boilerplate by hand, with drift: 19 used another key order or a plain-string export, 13 omitted `./src/*`. `fx.importmap.json` was grown by hand as fx js tests were added, and a bundle row could name a package its resolver manifest did not depend on, with nothing to catch it.

## Decision

`plugins.manifest.json` at the repository root lists, per package directory, its `entries` (subpath to source file), `raw` exports that are not plain source entries, whether it exposes `./src/*`, an optional `main`, and `files`. Three scripts read it:

- `scripts/sync-package-manifest.js` writes `exports`, `main` and `files` into each package.json and, without `--write`, fails on drift or on a package missing from the manifest. Writing it changed 19 package.json files, only in key order and plain-string exports.
- `scripts/gen-fx-importmap.js` generates `fx.importmap.json` from `fx.tests` in the manifest, crawling imports from those seeds, resolving workspace packages through the manifest and third-party packages through node_modules. A test that loads files at run time needs those files listed as seeds: the typert manifest test reaches `remote-stream` that way, and without the seed the map lost `@freddie/freddie-runtime/process`.
- `scripts/check-bundle-rows.js` checks that every package a bundle's `cordis.patch.yml` names is in that bundle's dependencies and that a row's subpath is a manifest entry; `--write` adds missing dependencies.

Witness: both generators are unchanged on the tree they wrote, each fails on a broken manifest (an extra file, a removed seed, a missing dependency, a bad subpath), publint and release verify are green, the four profile dumps keep their md5, and the five fx js tests and fx-seams pass on fx a4fdd93c with the generated map.

## Rejected

- Generating the bundle patch YAML from the manifest. The patches carry bundle-specific config, `!!js` expressions and long prompts; as JSON they would be harder to read and the manifest would be a second source for the same rows. The check closes the unchecked gap without a second source.
- Adding `./src/*` to the 13 packages that lack it. That widens their public surface; the manifest records the absence instead.

## Gave up

The manifest has no reader inside fx's loader: fx reads only `fx.importmap.json`, so the map stays a generated file rather than something the loader derives from the manifest.
