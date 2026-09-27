# Agent Note: code-language and workspace-path util packages

Status: implemented

## Problem

Two more small, self-contained dsh utility packages with real, verified upstream source and no freddie equivalent: `@deepseek-ai/dsh-util-code-language` (the single file-extension-to-syntax-highlighting-language table shared by document preview, diff review, and the read tool's persisted `lang` hint) and `@deepseek-ai/dsh-util-workspace-path` (browser-safe workspace path classification, display, and the `dsh-resource://file/…` address grammar). Both are pure, dependency-free logic — good low-risk candidates verified against dsh's own real `.ts` source and test assertions (per this session's "only port from verified upstream source" rule, checked against the correct clone this time — see [the Codex provider note](2026-09-27-subagent-codex-provider.md) for the earlier wrong-clone mistake).

A third candidate from the same batch, `@deepseek-ai/dsh-package-manifest`, was checked and skipped: it is TypeScript type-only declarations (`DshPackageManifest`, `DshBundleManifest`, etc.) with zero runtime exports — no analog exists in freddie's buildless plain-JavaScript-with-JSDoc architecture, so there is nothing to port.

## Decision

- `packages/util/code-language` (`@freddie/freddie-code-language`): `languageForPath(path)` and `readLangHintForPath(path)`, table-driven, case-insensitive, both path-separator styles. Ported unchanged — pure data and string logic, no adaptation needed.
- `packages/util/workspace-path` (`@freddie/freddie-workspace-path`): `isAbsoluteWorkspacePath`, `resolveWorkspacePath`, `abbreviateHomePath`, `workspaceTitleOf`, `pathPartsOf`, `relativizeToCwd`, `fileAddressFor`, plus `file-address.js`'s `sessionFileAddress`/`absoluteFileAddress`/`parseFileAddress`. One adaptation: the URI scheme is renamed `dsh-resource://` → `freddie-resource://` (and `dsh-app://app/` → `freddie-app://app/` in `fileMediaUrl`'s check), matching this session's established `@deepseek-ai/dsh-*` → `@freddie/freddie-*` naming substitution — freddie has no existing `resource://`/`app://` scheme convention to conflict with or reuse.

Both packages follow freddie's zero-dependency util convention (`util/deque`'s pattern): no `peerDependencies`/`devDependencies` at all, since dsh's own `@deepseek-ai/cordis` dep on both was vestigial workspace-tooling boilerplate, not a real runtime dependency.

## Alternatives considered

**Porting `dsh-package-manifest` as JSDoc `@typedef`s anyway.** Rejected: freddie has no build step that consumes standalone `.d.ts`-equivalent JSDoc typedef modules the way a TypeScript project consumes a types-only package: there is no compiler cross-checking manifest shapes against these definitions, so an empty runtime module would exist only as unenforced documentation with no consumer able to import from it meaningfully. Skipped rather than shipped as dead weight.

## Consequences

Verified live against dsh's own test assertions, transcribed into throwaway Node scripts and run directly against the built modules (not dsh's own vitest suite, which this project does not run): every `languageForPath`/`readLangHintForPath` case dsh's `code-language.spec.ts` checks (60+ extension mappings, case-insensitivity, both path separators, multi-dot suffix handling) passed unchanged; every `workspace-path`/`file-address` case across both of dsh's spec files (address round-tripping, encode/decode-once semantics, POSIX/Windows/UNC classification, home abbreviation, path splitting, relativization, and the full malformed-address rejection list) passed with only the `dsh-resource://`→`freddie-resource://` prefix substituted in expected values. `pnpm run publint`: 238/238 clean. CLI headless boot regression-checked cleanly (one transient flake on a Windows native-crash exit code reproduced clean on two immediate retries with no code change — unrelated to these changes, which import into no shipped profile).

Ships without `@deepseek-ai/dsh-package-manifest` (no runtime code exists to port) and without any freddie consumer wired to either package yet (same as several other util ports this session — the capability exists and is verified correct; wiring a document-preview or read-tool consumer to use it is separate, future work).
