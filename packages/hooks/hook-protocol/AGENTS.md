# @freddie/freddie-hook-protocol

## Rationale

- `codec.js` `parseHookOutput`: both dialects treat exit 2 as a block with stderr as its reason; structured stdout is valid only for a clean exit and only when it starts with `{` (reference engines treat other stdout as plain text); malformed JSON on a clean exit yields no structured output and the plain stdout stays available to the bridge.
- Top-level legacy `decision` accepts approve/block only (allow/deny/ask are invalid there per both schemas). `hookSpecificOutput` is keyed by `hookEventName`; its `permissionDecision` (allow/deny/ask) overrides the legacy decision and it carries `additionalContext` and `updatedInput`. The discriminator is always surfaced for diagnostics, but a missing or mismatched one cannot affect the firing event.
- `runner.js`: `ShellRunResult.exitCode` null (death by signal) maps to `undefined`, a non-blocking error; executor rejections (unusable workdir, missing shell) are also non-blocking (no exit code, failure on stderr) and the turn proceeds.
- `invariant.js`: event owners keep precommit staging local so their vocabularies never move into a central helper (`jscpd:ignore`).

## Protocol facts

- Exit 0 carries structured JSON or plain stdout (malformed JSON stays plain stdout); exit 2 blocks with stderr as the reason; any other exit is a non-blocking error. Decoding is total and never throws.
- Top-level legacy `decision` is only `approve`/`block`; `allow`/`deny`/`ask` are valid solely as `hookSpecificOutput.permissionDecision`, so a top-level `deny` is ignored rather than becoming a block.
- With `expectedEventName` set, a `hookSpecificOutput` block naming another event (or none) loses its event-scoped fields; top-level fields and the claimed `hookEventName` remain.
- Matching: Claude treats word-and-pipe patterns as literal alternatives and everything else as regex; Codex treats every non-empty pattern as an unanchored regex; missing/empty/`*` match all. Runtime treats invalid regexes as non-matches; config parsers reject them via `matcherDiagnostic`.
- Merge: permission precedence `deny > ask > allow`, first `continue:false` is sticky, winning-rank reasons are joined, context and system messages accumulate in hook order; an empty list is the neutral outcome (`decision: 'none'`).
- Defaults live here once: per-hook timeout 10 minutes (`timeoutSec` overrides) and the stderr summary cap, so the bridges cannot drift.
- `hook/*` events are turn-enclosed and invoked/result paired; SessionStart records injected context instead of appending `hook/*` outside a turn.
- Detached runs (emit-shaped points nobody awaits) are tracked, their signal aborts on drain, and settled runs are pruned; bridges drain on disposal so no process outlives the fiber.
- Types are no longer carried in JSDoc; the vocabulary is documented by the bridges and this note.
