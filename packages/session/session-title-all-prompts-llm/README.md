# @freddie/freddie-session-title-all-prompts-llm

Optional `ctx.sessionTitle` provider that summarizes every eligible human message through `ctx.llm`. It registers the `all-prompts` cadence, starts a new revision after each new eligible human prompt, and attributes the result to the exact seqs it folded. A newer revision aborts and supersedes older work, so a stale completion cannot commit. An automatic failure — including input over `maxInputBytes`, which fails instead of truncating history — warns and keeps the prior title; `ctx.sessionTitle.refresh()` is the explicit retry.

The plugin uses the complete required [shared LLM configuration](../session-title-llm/README.md#configuration). Omit both `provider` and `model` to inherit the exact route from the current logged main request, or set both to route title generation independently.

## Model Experience

### All-messages title request

#### What the model sees

The title model receives the shared title instruction and a JSON array of every eligible human message through the current revision, in log order with exact seqs. Seeded history is included, so a fork child's inherited prompts reach the request; later prompts reframe the whole array rather than adding to it.

#### Token effect

One auxiliary request may follow every new eligible prompt, bounded per request by `maxInputBytes` and `maxOutputTokens`; explicit refreshes may add calls. The main agent request gains zero tokens.

#### KV Cache effect

No main-request invalidation. Auxiliary input grows and changes after each prompt, so provider-specific cache reuse ends at the first changed JSON token.

## Known Limitations and Deferred Work

- **No summarization-of-summaries** — input over `maxInputBytes` fails and retains the prior title; this provider has no summarization-of-summaries or retention policy for very long sessions.
- **Messages are treated equally** — every eligible human message carries the same weight, with no filtering in this provider; a user rename still pins the title at the `session-title` service, and only `ctx.sessionTitle.refresh()` unpins it.
- **One provider at a time** — the title service refuses a second registration, so this plugin and the first-prompt provider are alternatives, not complements.
