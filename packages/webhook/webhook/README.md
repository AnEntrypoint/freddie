# freddie-webhook

Fire-and-forget webhook rule runtime: a provider-neutral registry of trusted rules that run arbitrary code against an authenticated delivery and, optionally, request one Workspace-backed root Session. `WebhookRuntime.dispatch(delivery)` starts every rule matching the delivery's `kind` and returns immediately — a rule's own async work, and the Session it may request, run detached from the caller (an HTTP handler that must answer the sending provider quickly, not wait for an agent turn to finish).

## Surface

```js
import { WebhookRuleId } from '@freddie/freddie-webhook'

ctx.webhookRuntime.register({
  id: WebhookRuleId('deploy-on-push'),
  kind: 'github',
  run(delivery, signal) {
    if (delivery.event.payload.ref !== 'refs/heads/main') return null
    return {
      workspacePath: '/home/user/projects/my-repo',
      title: `Push to main: ${delivery.event.name}`,
      prompt: 'A push just landed on main. Review the diff and run the test suite.',
      agentPreset: 'standard',
      permissionPreset: 'trusted',
    }
  },
})
```

`register` throws on a duplicate `id` and returns an awaitable disposer that aborts and drains every in-flight invocation of that rule. A rule's `run()` returns `null` for "no action" or a `WebhookSessionRequest` (an absolute `workspacePath` resolved-or-created as a Workspace, a `title`, a `prompt`, an `agentPreset` id, and a `permissionPreset` name — `model` is optional and defaults to the deployment's current default model). `createWebhookSession` then creates the agent, mounts the preset in `setup()` (the one supported `agentPresets.mount()` call site), attaches the Session to its Workspace, applies the permission preset, sets the title, and admits the prompt as a `source: { kind: 'plugin', plugin: 'webhook', ... }` user message — rolling back the Workspace attachment and agent if anything after creation fails.

`webhook/invariant` (loaded automatically as this package's companion) verifies that every webhook-origin message's Session belongs to exactly one Workspace whose path matches the Session's `cwd`, at prompt-admission time.

## Model Experience

The admitted prompt is an ordinary user message; its `source` carries the originating provider (`delivery.kind`), the configured adapter `source` id, the provider `deliveryId`, and the rule id that requested it — enough for the model (and any transcript reader) to see it arrived from an external trigger, not a person typing.

#### KV Cache effect

None beyond the ordinary user message the prompt becomes; nothing here varies a request header.

## Known Limitations and Deferred Work

- **No built-in HTTP ingress.** This package is the rule registry and Session-creation runtime only; `@freddie/freddie-webhook-github` is the first adapter that actually receives HTTP requests and calls `dispatch()`. A deployment with no adapter loaded has a runtime that nothing ever calls.
- **`agentPresets.acquireScope()`-style reference pinning does not exist here** (freddie's `AgentPresets.mount()` is itself single-flight and needs no separate scope handle, unlike the upstream primitive this was ported from) — `resolve()` + the `setup()`-time `mount()` call is the complete sequence.
- **Message source uses freddie's generic `kind: 'plugin'` convention** (matching `@freddie/freddie-schedule`'s own plugin-originated messages), not a dedicated declaration-merged `webhook` source kind — adding one would touch the shared message-source union for every consumer, not just this package.
