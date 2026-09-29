# @freddie/freddie-hook-protocol

## Rationale

- `codec.js` `parseHookOutput`: both dialects treat exit 2 as a block with stderr as its reason; structured stdout is valid only for a clean exit and only when it starts with `{` (reference engines treat other stdout as plain text); malformed JSON on a clean exit yields no structured output and the plain stdout stays available to the bridge.
- Top-level legacy `decision` accepts approve/block only (allow/deny/ask are invalid there per both schemas). `hookSpecificOutput` is keyed by `hookEventName`; its `permissionDecision` (allow/deny/ask) overrides the legacy decision and it carries `additionalContext` and `updatedInput`. The discriminator is always surfaced for diagnostics, but a missing or mismatched one cannot affect the firing event.
- `runner.js`: `ShellRunResult.exitCode` null (death by signal) maps to `undefined`, a non-blocking error; executor rejections (unusable workdir, missing shell) are also non-blocking (no exit code, failure on stderr) and the turn proceeds.
- `invariant.js`: event owners keep precommit staging local so their vocabularies never move into a central helper (`jscpd:ignore`).
