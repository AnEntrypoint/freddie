# Agent Note: session inject results are cached by session id, not info identity

Status: implemented

## Problem

`cachedSessionInject` and `cachedSessionMaybeInject` cached each entry's inject result in a `WeakMap` keyed by the `info` object. The session-maybe path builds a new `infoForRender` object on every outlet render, so the cache missed on every render. The inject then reran on every streamed token. `conversation.composer.bar` (`apply.js` inject) was the top Cordis-proxy caller, about 0.38 ms per token, and its fresh closures also changed the composer owner props.

## Decision

`runInject` reads only `info.sessionId` and the `actions` argument, so the cache is keyed by those two values. Each entry keeps one `{ sessionId, actions, props }` record. Switching sessions recomputes once, as before.

## Verification

Streaming bench (400 messages, 200 tokens at 16 ms): the Cordis `inject` caller leaves the top list. Script time is 6.3 to 6.9 ms per token across runs, within the bench's run-to-run noise, so the change is verified by profile attribution rather than by wall time. Drag bench store check passes (conversation changes after "New session"), and no console errors beyond the fixture's unavailable RPC endpoints.

## Open

- Composer subtree still re-renders on each token because `InputZone` carries the whole session snapshot (`zone.session`), which changes per token. Removing that needs a slot contract decision.
- `lexicon.getSnapshot` resolves `inputTriggers` through a Cordis lookup on every read (`ui-conversation/src/client/input/facade.js:37`), about 0.24 ms per token.
