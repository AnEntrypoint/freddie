# Agent Note: slot host closes over locale, core and store resolution

Status: implemented

## Problem

`SlotRegistry.hostFace()` returns the face that every slot outlet reads on each render. Its methods read `this._core`, `this._locale` and `this.resolveStore` through the Cordis service proxy, so each `core.specDynamic`, `core.entries` and locale read costs a `get cordis/src/reflect.js` hop. In the streaming bench these were the top Cordis callers on the per-token path (`locale`, `specOf`, `entriesOf`, `resolveStore`).

## Decision

- `installLocale` stores the face in a plain holder object (`_localeSlot = { face }`) and the host's `locale` getter reads that holder, not a service field.
- `hostFace()` captures `core`, `localeSlot` and a bound `resolveStore` once, then every host method closes over those locals. The host object is built once, so the captured values are constant for the registry's lifetime.
- `installLocale` keeps its boot-once guard and its disposer, which clears the holder only when it still holds the same face.

## Verification

- Streaming bench (400 messages, 200 tokens at 16 ms): `newestUserVisible` is true and no errors beyond the fixture's unavailable RPC endpoints. The `locale`, `specOf` and `entriesOf` callers leave the top Cordis list. Remaining top Cordis callers: `getSnapshot` at `ui-conversation/src/client/input/facade.js:36` (about 0.31 ms per token) and `sessions` at `ui-conversation/src/client/service.js:56` (about 0.14 ms per token).
- Script time is 6.5 to 7.3 ms per token across runs; wall time is within the bench's run-to-run noise, so the claim rests on profile attribution.
- Drag bench, changed versus HEAD `slots.js` as control: per-move script 1.31 ms versus 1.39 ms, within noise. The `storeCheck` probe reads identical on both (conversation head unchanged after "New session", sidebar 5 to 5), so the probe is inconclusive and was not affected by this change.

## Open

- `facade.js:36` lexicon `getSnapshot` still resolves `inputTriggers` through `rootCtx` on each read (about 0.31 ms per token). See [[2026-10-13-session-inject-cache-keyed-by-session]].
- Composer subtree still re-renders on each token because `InputZone` carries the whole session snapshot (`zone.session`); see [[2026-10-13-outlet-reads-only-user-and-root-slots]].
