# `@freddie/freddie-auto-review`

Authorization reviewer for the `auto` permission preset: a model reviews **every** tool call before its body runs, and only an allow lets the call through.

Ported from dsh's `experimental/auto-review` into freddie's buildless plain-JS Cordis plugin idiom. The port keeps upstream's fixed five-section review request, its closed `risk`/`decision` protocol, and — deliberately — its fail-closed posture: a component that can deny a tool call is a security control, so an unreadable policy, a reviewer error, a failed model call, a timeout, or any disagreement between the pending execution and the durable log denies the call instead of permitting it.

## What it does

- Installs a **prepended** `tools/pre-execute` listener, so review runs before any other pre-execute gate.
- Acts only while the session has **explicitly selected** the `auto` preset (`permission/preset` event). Every other preset passes straight through, untouched.
- Reviews each **native** call and each **Code Mode inner** call once. The outer `run_code` transport is not a decision point: its inner calls are.
- Sends one independent LLM request per call through `ctx.llm.stream`, using the session's own request-header route unless `provider` and `model` are both configured; the session's request header must still carry a complete route, because the review snapshot is built from it either way.
- On `allow`, defers to downstream listeners and returns their decision. On `deny`, escalates to the user (`ask`) when the session's effective approval policy is `ask`, or denies outright when it is `never`.

## Configuration

```yaml
# cordis.patch.yml
- id: auto-review
  name: '@freddie/freddie-auto-review'
  config:
    preset: auto            # preset name that enrolls a session
    advertise: true         # add `auto` to the permission-preset table
    # provider: ~           # optional explicit review route (pair with model)
    # model: ~
    timeoutMs: 60000
    maxOutputTokens: 2048
    maxInputBytes: 262144
```

Requires `@freddie/freddie-llm`, `@freddie/freddie-permission-presets`, `@freddie/freddie-timeout`, `@freddie/freddie-tools`, and `@freddie/cordis`; `inject` is `['llm', 'permissionPresets', 'approval', 'tools']`, so the plugin stays inert until they are all mounted.

`provider` and `model` are a pair: supply both to pin the review route, or neither to follow the session. Selecting `auto` sets sandbox `danger-full-access` and approval `ask`, so an allowed call executes immediately and a denied call prompts.

## The review request

Five fixed sections, four of them framed as JSON so session text cannot break structural delimiters:

| Section | Role |
|---|---|
| `REVIEW_POLICY` | Constant system prompt: the risk classes, the source roles, the closed output shapes, and the fail-closed rule. |
| `ENVIRONMENT` | `{ cwd }`, the one authoritative sandbox target. |
| `PROJECT_INSTRUCTIONS` | Project-instruction messages, always `constraint` — they can only narrow. |
| `FILTERED_HISTORY` | Human and direct-parent text with fixed instruction roles, every logged call as a `fact`, and compaction summaries as `checkpoint`. |
| `PENDING_ACTION` | The pending call's mode (`native` or `code-inner`), name, description, parameter schema, and arguments. |

Source roles are assigned, not inferred: `human-instruction`, `direct-parent-instruction`, `constraint`, `checkpoint`, or `fact`. Non-text blocks and every other non-human source are always `fact`, and tool-result messages are left out of the request entirely, so an image or a prior tool result can never authorize an action, and a compaction checkpoint can never inherit the authority of the text it replaced.

## Integrity check

Before the review is requested, the plugin proves the execution it is about to describe is the action the log records. It must find **exactly one** matching durable record — `tool/call` for a native call, `tool/code-dispatch-start` for a Code Mode inner call — whose name, arguments, and (for an inner call) root call match the pending execution. Zero matches, several matches, or a name/argument mismatch denies. A review of an action the plugin cannot describe is not a review.

## Fail-closed paths

Every one of these denies the call; none permits it:

- the reviewer errors, aborts, times out, or ends without a terminal `finish`;
- the output is not exactly one JSON object, repeats a member, or is not one of the six valid `risk`/`decision` shapes;
- the session has no complete request-header route, whether or not a `provider`/`model` route is configured;
- the session has no working directory;
- the pending tool has no visible schema, or an incomplete one;
- the pending execution is missing, ambiguous, or disagrees with the log;
- the framed prompt exceeds `maxInputBytes`;
- the plugin is disposed while a review is in flight.

## Exported API

| Export | Purpose |
|---|---|
| `name`, `inject`, `Config`, `apply` | Cordis function-plugin surface. |
| `AUTO_PRESET`, `AUTO_PRESET_BUNDLE` | The preset name and its sandbox/approval bundle. |
| `REVIEW_POLICY` | The constant review policy, for auditing or reuse. |
| `AUTO_REVIEW_TIMEOUT_CODE` | Reason code stamped on a review timeout. |
| `snapshotAutoReview(ctx, exec)` | Build the frozen route + four data sections; throws on any inconsistency. |
| `reviewUserText(snapshot)` | Render the four data sections. |
| `parseReviewDecision(text)` | Parse and validate the closed output protocol. |

`apply(ctx, config)` returns nothing; everything it owns is released through one `ctx.effect()` disposer, including removal of the advertised preset and an abort that settles in-flight reviews as denials.

## Extension points

None. The policy, the section framing, the risk classes, and the output protocol are fixed constants: a caller-configurable policy would make the security control's behavior deployment-dependent and unauditable.

## Model Experience

### Review request (independent request)

#### What the model sees

A separate `ctx.llm.stream` request whose system prompt is the fixed `REVIEW_POLICY` and whose single user message carries the `ENVIRONMENT`, `PROJECT_INSTRUCTIONS`, `FILTERED_HISTORY`, and `PENDING_ACTION` sections as indented JSON. Framing echoes upstream exactly, including the trailing no-prose rule that makes an allow a parseable object:

##### Verbatim text for this field, when needed

```markdown
For any allow, end with exactly the applicable two-member object and nothing else. In particular, when a medium action is allowed, the complete text must be exactly {"risk":"medium","decision":"allow"}. Do not add reason, explanation, labels, Markdown, or surrounding prose. Stop immediately after the closing brace.
```

#### Token effect

Conditional and capped. One request per tool call; `maxInputBytes` bounds the framed prompt and `maxOutputTokens` bounds the reply. The request never enters a session log, so reviewer reasoning and raw responses are not retained.

#### KV Cache effect

Independent. The review request is its own model request, outside the session's prompt, so it neither extends nor invalidates the session prefix. Its own `REVIEW_POLICY` prefix is stable across calls within one revision, and its data sections change with every call.

### Denial and escalation text

#### What the model sees

A denied call becomes a normal error tool result: `Error: Auto review rejected tool "<name>"; its body was not executed` (plus the reviewer's reason when it supplied one), or `Error: Auto review of tool "<name>" failed; its body was not executed: <message>` for a failure. An escalated call under `ask` is decided by the approval service, not by this plugin.

#### Token effect

Fixed and small: one sentence appended to the turn that made the call.

#### KV Cache effect

Append-only. The text lands after the call it concerns and never rewrites earlier tokens.

## Known Limitations and Deferred Work

- **Auto preset advertisement is a runtime table mutation** — freddie has no `registerAuto`-style contribution API, so the plugin adds `auto` to `ctx.permissionPresets.presets` and removes it on disposal. If a composition's own defaults are exactly sandbox `danger-full-access` plus approval `ask`, `auto` becomes the derived default for newly published sessions and those sessions enroll in review without an explicit switch. Set `advertise: false` to compose the gate without touching the table, or set `defaultPreset` explicitly. A table entry named `auto` that already exists is never overwritten.
- **The settings section is built at service construction** — the permission-preset settings schema captures its choices when `PermissionPresetService` is constructed, so `auto` is reachable through `/permission auto` but is not offered in that section's default-preset dropdown.
- **No `cancel` decision** — freddie's `PreToolDecision` has no `cancel` kind. Where upstream returns `{kind:'cancel'}` on disposal, the port returns `{kind:'deny'}`; the body does not execute either way, but the model sees a denial rather than a cancellation.
- **Unloading the plugin stops gating, and that is inherent** — cordis removes the `tools/pre-execute` listener before the disposer's abort runs, so after a hot unload calls execute unreviewed while the session's `permission/preset: auto` event still stands. The withdrawn-deny path is therefore defensive: it covers a review that is in flight when the lifecycle aborts, not the unloaded composition. A deployment that needs the gate to be non-removable must make it part of the standing composition rather than a plugin a user can unmount.
- **No PTC binding schema** — upstream's PTC execution carries a binding schema on the execution object; freddie's Code Mode does not. Pending schemas come from the latest request header, falling back to `ctx.tools.get(name, agent)` so a Code Mode inner call under a collapsed presentation still resolves.
- **No history-entry cap** — the bounded knob is `maxInputBytes` (the `freddie-session-title-llm` precedent); exceeding it denies. Upstream's separate entry-count cap is not ported.
- **No `agent-message` or `compact-checkpoint` source kinds** — freddie has neither. Agent-authored and other non-human, non-project sources fall through as `fact`, which can only narrow.
- **Reviewer reasoning is not retained** — the review request bypasses session logging entirely, so an audit cannot replay why a specific call was denied beyond the reason the reviewer returned.
