# Agent Note: root header read tolerates a sessionless root

Status: implemented

## Problem

`ConversationRoot#render` destructured `useSessionHeader(s => s)` directly. Per-session hooks (`session`, `sessionHeader`, `composer`) exist only while a session is provided (`runtime/src/client/sessions/provide.js`). On a fresh app with no session, the hook returns `undefined`, and the destructure throws `Cannot destructure property 'composerPhase'`. The drag bench, which boots without seeded sessions, failed at app-ready on `e7886238`. The streaming bench seeds sessions and did not hit it.

## Decision

Read the phase with optional chaining: `const composerPhase = useSessionHeader(s => s)?.composerPhase`. Behaviour is unchanged: when `sessionId` is `undefined`, `hero` is already true and `settling` requires a session, so `composerPhase` is never consulted for a sessionless root.

## Verification

- Drag bench on the fresh app (no seeded session): boots, no errors, per-move script 0.68 ms, store probe unchanged (sidebar 5 before and after).
- Streaming bench (400 messages, 200 tokens at 16 ms): `newestUserVisible` true, only the three fixture RPC errors, outlet inclusive 1.29 ms per token on this tree.
