# freddie-authorization

Authorization Service Definition (`ctx.authorization`): the seam for obtaining a credential nobody can supply from configuration alone, because getting it requires a conversation with the human — open this page, paste that code, pick an account.

Three consequences follow from that one job:

**The seam owns the conversation and the lifecycle; it never owns the protocol.** A plugin that knows how to obtain its own credential registers a **flow** keyed by the credential key that flow writes. A second authorization protocol arrives as another flow, not as another seam, and a surface that renders one flow renders all of them.

**One attempt per key at a time.** Two callers cannot share a flow: they would be prompting different humans through it, and the second would answer questions the first was asked. A second `begin()` is refused rather than joined.

**The flow owns the write, and the seam confirms it.** Committing inside `run()` is what lets a library that persists through its own store adapter stay the single writer instead of being copied back out and written twice. The seam then confirms the commit it witnessed — a `credentials/record-updated` for this key during the attempt, and a record still present after it — before it reports `authorized`. A flow that resolved without committing throws `NOT_COMMITTED` rather than returning success.

## Surface

```js
import { Context } from '@freddie/cordis'
import { credentialKey } from '@freddie/freddie-credentials'

declare const ctx: Context

const key = credentialKey('llm-pi-ai', 'openai-codex')

const dispose = ctx.authorization.registerFlow({
  key,
  label: 'ChatGPT (Codex)',
  methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
  async run(session) {
    session.notify({ message: 'Continue in your browser', url })
    await session.commit({ kind: 'grant', payload: await exchange(session.signal) })
  },
})

ctx.authorization.list()                       // every registered flow, in registration order
ctx.authorization.describe(key)                // one flow + whether an attempt is running now
await ctx.authorization.begin({ key, interaction })
// → { status: 'authorized' } | { status: 'cancelled' }
ctx.authorization.cancel(key)                  // withdraw a running attempt from another call
```

A flow is validated when it is registered, not when it is begun: a key that is not a `<scope>/<id>` credential key (`BAD_KEY`) or a flow offering no method (`NO_METHOD`) fails the registering plugin's activation, where the mistake is. One flow per key — `DUPLICATE_FLOW` — because two plugins claiming one key would each write a record in their own format and whichever ran last would leave the other reading a payload it cannot parse.

### The interaction vocabulary

A flow never knows which surface is listening. It receives a `session` scoped to one attempt:

- `session.notify(notice)` — `{ message, url?, code? }`, fire-and-forget. A surface that cannot render a notice (a page whose connection just closed) loses the notice, never the attempt; the failure is logged at the seam.
- `session.prompt(prompt)` — `text`, `secret`, or `select`. `secret` differs from `text` only in presentation: a surface masks it and keeps it out of logs. `select` resolves with the chosen option's `id`. A prompt may carry its own `signal` so a flow can withdraw one question without withdrawing the attempt.
- `session.commit(record)` — the write. It rejects once the attempt is no longer active, and once admitted, cancellation waits for it to finish rather than aborting mid-write.
- `session.signal` — aborted when the caller withdraws or `cancel()` fires for this key.

The surface half is supplied with the request rather than registered, because the caller that starts an authorization is the one that can talk to the human about it: prompts reach exactly the page that asked, and a headless caller supplies an interaction that declines.

### How an attempt ends

| Ending | Caller sees | `authorization/settled` reports |
|---|---|---|
| Record committed and observed | `{ status: 'authorized' }` | `authorized` |
| Human declined a prompt | `{ status: 'cancelled' }` | `cancelled` |
| Caller's signal withdrew, or `cancel()` | `{ status: 'cancelled' }` | `cancelled` |
| Flow threw, or committed nothing | the thrown error | `failed` |

Declined prompts settle as `cancelled`, not `failed`, because the human saying no is a refusal, not a breakage. Only a human's "no" may reject with `AuthorizationDeclinedError`: a prompt withdrawn by its own `signal` must reject with something else, or a later genuine failure would be misread as a decline.

## Events

`authorization/settled (key, settlement)` fires for **every** terminal outcome, failures included, after the key is released — so a surface watching a key it did not start (a second browser tab) learns the attempt is over. Listener failures are contained and logged without changing the attempt's own outcome, except `INVARIANT`-coded failures, which rethrow after every listener ran; that rethrow reaches the emitter only from synchronous listeners, so invariant checks on this event must not be async functions.

## Errors

`AuthorizationError` extends `HarnessError`, so every failure carries a stable machine-routable `code` distinct from its message: `DUPLICATE_FLOW`, `BAD_KEY`, `NO_METHOD`, `NO_FLOW`, `UNKNOWN_METHOD`, `ALREADY_IN_FLIGHT`, `CANCELLED`, `NOT_COMMITTED`, and `DECLINED` (`AuthorizationDeclinedError`).

## Security posture

This is a trust boundary, so the seam is built to deny rather than to allow:

- **No credential ever reaches a log, an event payload, or an error message.** Notices, entries, settlements, and error strings name keys and statuses; never values. A `grant` payload is opaque and is passed through `ctx.credentials` without being read.
- **A flow that did not commit is a failure.** `NOT_COMMITTED` is thrown when no commit was observed during the attempt, and again when the record is absent afterwards. Reporting `authorized` on an unwritten record would send a caller away believing a credential is stored.
- **Cancellation wins over a late write.** `commit()` re-checks that its own attempt is still the live holder of the key before writing, so a withdrawn or superseded attempt cannot land a record the human withdrew from.
- **Never stall on a broken surface.** Notice rendering is contained; only the notice is lost.
- **Fail loud at registration.** A flow whose key is unaddressable or whose method list is empty never enters the registry, rather than failing at the moment a user asks for it.

## Model Experience

None, as `ctx.authorization` is driven by a configuration surface rather than by the model: no tool, prompt, or system-progress block renders a flow, a notice, or a prompt. An agent that needs a credential it does not have fails through its provider's own error, which reaches the model through that provider's surface.

#### KV Cache effect

No direct invalidation; no key, notice, prompt, or credential value from this seam enters a request prefix.

## Known Limitations and Deferred Work

- **No flow ships here.** The seam is a registry; every flow belongs to the plugin that owns the protocol, and this package owns none. Nothing can be authorized until a plugin registers a flow.
- **Commit confirmation depends on `credentials/record-updated`.** A provider that writes a record without emitting it makes every attempt end in `NOT_COMMITTED` even though the credential is stored — deliberately fail-safe, but it means a provider must publish the event to be usable here.
- **No attempt timeout.** A flow that ignores its signal and never settles holds its key for the life of the process; withdrawal stops the seam waiting on it but cannot stop the flow itself.
- **One interaction per attempt.** Prompts reach exactly the surface that called `begin()`; there is no fan-out to other surfaces, and no way for a second page to answer a question the first one asked.
