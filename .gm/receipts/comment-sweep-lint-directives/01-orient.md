# 01-orient: comment-sweep-lint-directives

session: mcp-codemode-3535970-1793542718115-1-14
row: comment-sweep-lint-directives (state, pending, `.gm/prd/comment-sweep-lint-directives.yml`)

## Acceptance

Row subject, verbatim clauses:
- Pre: exhaustive first-party JS scan found 59 lint-suppression comments across 38 files.
- Invariant: each directive is eliminated by an equivalent self-explanatory code shape, or retained only where tool syntax is semantically required and documented as a verified exception.
- Post: no redundant lint comments remain; any necessary directives have a live lint/runtime witness.

Acceptance (derived, from the Post clause): no first-party JS source line carries a lint-suppression directive, and every retained one has a live lint/runtime witness.

## Symbols named by the row

None. codeinsight `callers`/`impact` not applicable.

## Measured premise (live codesearch)

First-party scope = whole tracked tree excluding `packages/client/vendor-modules/**`.

- Comments mode, `eslint-disable`, unfiltered: 20 directives, all under `packages/client/vendor-modules/vendor/` (dispatch 1793542980256-94-421409dd85e99a34).
- Comments mode, same query with `exclude: **/vendor-modules/**`: directive_count 0, files_scanned 1941 vs 2318 unfiltered (dispatch 1793543065169-151-c0b8a9450443d76b).
- Literal, first-party scope, zero hits: eslint-disable, eslint-enable, eslint-env, biome-ignore, @ts-ignore, @ts-expect-error, @ts-nocheck, @ts-check, prettier-ignore, istanbul ignore, c8 ignore, jshint, stylelint-disable, no-console, nolint, noqa, lint-ignore.
- Literal, first-party scope, non-zero hits are markdown prose only:
  - `oxlint-disable`: 2 (`.agents/skills/freddie-trim-cot-leakage/SKILL.md:30`, `.agents/skills/freddie-trim-cot-leakage/references/examples.md:187`).
  - `v8 ignore`: 5 (archived/implemented notes, plus `packages/schedule/schedule/AGENTS.md:5`).

Vendored payloads (out of first-party scope; immutable upstream bytes), literal counts over `packages/client/vendor-modules/vendor/`:
- eslint-disable: 20 directive lines in 13 files.
- @ts-expect-error: 49 occurrences in 18 files.
- @ts-ignore: 10 in 3 files.
- c8 ignore: 10 in 7 files.
- istanbul ignore: 2 in 2 files.
- biome-ignore: 1. jshint: 1.

The row's "59 across 38 files" is not reproduced: first-party is 0, and the vendored totals do not match either. Premise is stale.

## Governing facts

- `packages/client/vendor-modules/AGENTS.md:13`: existing versioned vendor files reject content drift; a version change is the route, not an in-place edit.
- `packages/client/vendor-modules/scripts/generate-vendor.mjs`: the generator refuses to overwrite differing bytes under the same version.
- `.agents/notes/implemented/process/2026-10-26-vendor-comment-strip-version-bump.md`: vendor payloads follow version bumps, not comment-only drift (commit 883bdfbd).
- `packages/AGENTS.md` (Source contracts): preserve upstream dependency source.
- `packages/schedule/schedule/src/domain.js` is tracked and contains no `v8` text at all (literal, path `packages/schedule`, 1 match in total: the AGENTS line; dispatch 1793543201362-253-4695a0ead63d775). `packages/schedule/schedule/AGENTS.md:5` claims it carries `v8 ignore` directives. That claim is false.

## Commits channel

Dual-mode query "lint suppression directive eslint-disable comment" (dispatch 1793543195757-248-b89fcf8000eb7500): BM25 skipped (`route_without_index`), vector hits were nearest neighbours only (no literal occurrence), commits channel returned 883bdfbd (vendor comment-strip bump).

## Files cited

- `.gm/prd/comment-sweep-lint-directives.yml`
- `packages/schedule/schedule/AGENTS.md`
- `packages/schedule/schedule/src/domain.js`
- `packages/client/vendor-modules/AGENTS.md`
- `packages/client/vendor-modules/scripts/generate-vendor.mjs`
- `.agents/notes/implemented/process/2026-10-26-vendor-comment-strip-version-bump.md`
- `.agents/skills/freddie-trim-cot-leakage/SKILL.md`, `.agents/skills/freddie-trim-cot-leakage/references/examples.md` (markdown, not source)

## Friction

- `gm.db` store lock contention once: `store_busy` (`.gm/gm.db.lock` held by another dispatch). Retried unchanged; succeeded.
- Literal scans report `exhaustive:false` with `files_skipped_minified_count`; comments mode reports `exhaustive:true`. Used comments mode for directive counts.
