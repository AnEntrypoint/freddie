# Agent Note: Shared closed-union/JSON/freeze primitives in `util/values`

Status: implemented

## Problem

`assertNever`, lossless-JSON `isJsonValue`/`snapshotJsonValue`, and an iterative `deepFreeze` (with the `AbortSignal`-skip rule) each existed as more than one independently maintained, behaviorally-identical copy: `assertNever` in `packages/llm/llm/src/never.js` plus 12 further hand-rolled copies across client, compaction, feedback, goal, host, and session-telemetry packages; `deepFreeze` in `packages/llm/llm/src/call-config.js` plus a dozen more; `isJsonValue`/`snapshotJsonValue` duplicated byte-for-byte between `packages/llm/llm` (indirectly) and `packages/core/session/src/json.js`. None of these depend on anything LLM- or session-specific, so `@freddie/freddie-llm` and `@freddie/freddie-session` were the wrong shared home for callers (settings, client runtime) that have no reason to depend on either. `WeakMapWithValues` — a weak-key map with a strongly retained, iterable value set — had no implementation in the tree at all.

A comparative study against `deepseek-ai/deepseek-harness` (commit range `ae76ed2874`..`477b4f4205`, 2026-07-28 to 2026-09-27; full diffstat/commit log retained outside the repo, see Consequences) showed this upstream project extracted the same primitives into a zero-dependency `util/values` package for exactly this reason.

## Decision

`packages/util/values` (`@freddie/freddie-values`) is a new zero-dependency package exporting `assertNever`, `isJsonValue`, `snapshotJsonValue`, `deepEqualJson`, `deepFreeze`, and `WeakMapWithValues`. `packages/llm/llm/src/never.js` and the `deepFreeze` export of `packages/llm/llm/src/call-config.js` now re-export from it instead of defining their own copies; `packages/core/session/src/json.js` does the same for `isJsonValue`/`snapshotJsonValue`. Both packages gained `@freddie/freddie-values` as a peer + dev dependency. Neither package's own public export surface changed — `@freddie/freddie-llm` and `@freddie/freddie-session/src/json.js` still export the same names — so no downstream import site needed to change.

`packages/util/deque` (`@freddie/freddie-deque`) is a second new package, a zero-dependency circular deque with O(1) push/pop at both ends, ported from the same upstream project. It has no consumer yet; several packages (`workflow/graph`, `subprocess-local/spawn`, `e2b/subprocess-e2b/output`, `attachment-local/compression-limiter`) currently drain a FIFO with `array.shift()`, which is O(n) per removal, and are candidates for a future migration.

## Alternatives considered

**Put the shared primitives in `@freddie/freddie-llm`, where `assertNever` and `deepFreeze` already lived.** Rejected: packages with no LLM concern (`settings`, `client/runtime`) would need to depend on the LLM package for a JSON/freeze helper, which is exactly why they wrote their own copies instead. A zero-dependency `util/` package is dependency-appropriate for every caller.

**Migrate every duplicate site (13 `assertNever`/`deepFreeze` copies, `settings`'s and `llm-deepseek`'s `deepEqualJson`) in this same change.** Rejected as too large a blast radius to verify together: `packages/settings/settings/src/index.js` and `packages/client/runtime/src/client/contract/store.js` in particular sit on different dependency boundaries (settings loads before most of the graph; client/runtime ships to the browser) and each swap needs its own live-drive verification. This change covers only the two call sites (`freddie-llm`, `freddie-session`) verified live in Consequences; the remaining duplicates are deferred, not abandoned.

**Keep `isJsonValue`/`snapshotJsonValue` only in `core/session` since that is their only real consumer today.** Rejected: the upstream project's package boundary (generic, zero-dependency, not session-specific) is the one worth matching, and `deepFreeze`/`assertNever` already needed a session-independent home regardless.

## Consequences

Three of four upstream `util/values` exports were pure additions (`deepEqualJson`, `deepFreeze` as a *shared* export, `WeakMapWithValues`); `assertNever`/`isJsonValue`/`snapshotJsonValue` replace local re-implementations with a re-exported reference to the same function, verified live via `node --input-type=module` in `packages/core/session` asserting `llmDeepFreeze === deepFreeze`, `llmAssertNever === assertNever`, and the `core/session` re-exports being reference-equal to the `util/values` originals, plus behavioral checks of every export (freeze-in-place including nested arrays, lossless-JSON accept/reject, structural equality, the `unreachable variant` throw, and `WeakMapWithValues` set/get/delete). `pnpm run publint` passes for both new packages. A full `pnpm freddie --profile headless "say hi"` boot (exercising `agent-loop`'s `deepFreeze`-marked requests and `core/session`'s `isJsonValue` event validation on the hot path) completed and returned a real model response, so the delegation carries no regression on the exact code paths it touches.

The 12 remaining `assertNever` duplicates, the ~11 remaining `deepFreeze` duplicates, and the `deepEqualJson` duplicates in `llm-deepseek`/`settings`/`settings-file` are unchanged and still independently maintained; each is a candidate for a later, individually-verified migration to `@freddie/freddie-values`, not something this change silently fixed. `freddie-deque` ships with no consumer yet, per the package invariant rule that an explained empty companion is correct; migrating an `array.shift()` site to it is deferred future work.

This is the first of several packages identified by the `deepseek-ai/deepseek-harness` comparison (287 package-level path differences as of the studied commit range, most requiring a product decision — browser-use, computer-use, voice, SSH remoting, webhook ingress, a session-format migration chain — rather than a mechanical port); the rest are tracked outside this Note and not implied to be committed to by it.
