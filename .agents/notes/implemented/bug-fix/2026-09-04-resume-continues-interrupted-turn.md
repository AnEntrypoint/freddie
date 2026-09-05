# Agent Note: Resume continues an interrupted turn

Status: implemented

## Problem

Cold persistence repair closes a crashed mid-turn log with a synthetic `turn/end { reason: { kind: 'interrupted' } }` so the transcript is provider-valid. `ctx.agents.resume` then published that session idle. The unfinished work sat as a Stopped row until a person noticed and re-prompted, which is the opposite of crash recovery: the durable log already named the interruption, and nothing consumed it.

A live user cancel records `{ kind: 'aborted' }` (or similar) and must not be treated as a crash. Only the repair closer is the signal that the process ended before the turn did.

## Decision

After `resumeWith` publishes a handle, `continueIfInterrupted` reads the last `turn/end`. When `reason.kind` is `'interrupted'`, it queues a plugin `notice` follow-up (`source.kind: 'plugin'`, `plugin: 'agent-loop'`) that tells the model to continue from the log rather than restart. Publication has already entered the registries, so `followup` is a legal waking send. A last reason that is not `'interrupted'` is left idle.

The follow-up is not a human prompt: consumers that key on `source.kind === 'user'` keep treating it as harness-produced context.

## Alternatives considered

**Leave resume idle and require a human re-prompt.** Rejected: the log already records that the turn was cut off; waiting for a person to notice is how unfinished work is lost after a `dsh web` restart.

**Call `followup` before publication.** Rejected: setup must not drive the unpublished agent, and inbox delivery needs a live driver.

**Treat every non-`completed` closer as auto-continue.** Rejected: a user or parent abort is a genuine stop. Only persistence repair emits `'interrupted'`.

**Inject without waking.** Rejected: idle injection waits for another delivery. Crash recovery has to start the next turn itself.

## Consequences

A session whose last closer is `'interrupted'` starts a new turn on the next resume (config-driven remount or on-demand session open) without a further human prompt. A cancelled turn stays stopped. The notice is model-visible and billed as one extra user-role message.

## Verification

Live `dsh web` at `http://127.0.0.1:5499`: `/vendor/webjsx@0.0.73/dist/applyDiff.js` serves the keyedMap primitive guard; this session's log is mid-turn (open `tool/call` with no `turn/end`) so a restart would synthesize `'interrupted'` and this path would fire. `createUserMessage` accepts the plugin `notice` source used here. A live user cancel remains `{ kind: 'aborted' }` and is not overridden.
