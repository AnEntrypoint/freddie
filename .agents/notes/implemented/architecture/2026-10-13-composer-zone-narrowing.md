# Agent Note: Composer zone narrowing

Status: implemented

## Problem

Each streamed token re-rendered the conversation composer subtree at about 2.2 to 2.8 ms per token inclusive. The composer element re-ran its whole render on every session-hook notification even though its output depended only on a few session facts, and its input currency was the whole session object. The composer chain selector also read `owner.session`, so any session field change re-selected the chain.

## Decision

Three narrow changes, each with one owner:

1. The composer chain currency carries only `interactions`, `subagent` and `running` (`ComposerChainProps` in `packages/extensions/cordis-client-runner/src/client/slot-catalog.js`). `ui-subagent`'s chain selector reads `{ subagent, running }` instead of the whole session. The input-region `InputZone` declares only `input: InputState`.
2. `FreddieConversationComposer#render` keeps a per-element key (hero, session id, the three session facts, the input snapshot, the composer block, workspace chip state, picker state and the bound callbacks). A notification that changes none of these returns before any vnode work. `setProps` renders with the skip check; `connectedCallback`, picker callbacks and workspace selection still render unconditionally.
3. `SessionInputShell.publish()` (`packages/client/ui-conversation/src/client/input/facade.js`) skips `state.set` when every composed field is `Object.is`-identical to the stored snapshot. Before this, every publish created a new wrapper object, so `useInput(s => s)` returned a new identity on each publish and the composer key always missed.

Rejected: (b) removing the input identity from the composer key and depending on a derived presence fact. That leaves the composer's `input` zone stale for documented consumers. Also rejected: caching the whole session identity, because session and location handles mutate internally, so reference equality does not establish unchanged content.

## Verification

Live bench, worktree build, `stream-bench` with `DIAG=0 MSGS=400 TOKENS=200 INTERVAL=16`:

- Composer inclusive ms/token: 2.31 before the key change, 1.65 after the key change, 0.633 after the publish guard.
- `shape.newestUserVisible` true. Errors are the three fixture RPC errors (`syncInspectManifest`, `inventory` twice), the same set as the baseline run.
- Chat 0.83 and outlets 3.09 ms/token inclusive in the final run.

Live `drag-bench` (worktree build): no errors; the sidebar resized from 280px to 420px.

Probe evidence: before the publish guard the composer skipped about 9 renders per token, and the remaining renders came from `inputState` identity alone (185 changes per 200 tokens) while no composed field changed.

## Open items

- Outlets (3.09 ms/token) now dominate the inclusive cost. Their default `'all'` subscriptions are the next candidate; they were not changed here.
- The publish guard relies on `InputMachine` replacing a field only when its value changes. That held in the probe, but no test pins it.
