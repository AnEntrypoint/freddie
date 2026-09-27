# Agent Note: Inbound webhook capability (fire-and-forget rule runtime + signed GitHub adapter)

Status: implemented

## Problem

Freddie had no way for an external event (a GitHub push, a CI failure, any signed HTTP callback) to start an agent session on its own — every session began from a person typing or an already-running agent's own follow-up. `deepseek-ai/deepseek-harness`'s `webhook/webhook` + `webhook/webhook-github` packages solve exactly this: a provider-neutral rule registry that creates a Workspace-backed root Session in response to an authenticated delivery, plus a signed HTTP adapter per provider.

This is new inbound attack surface — an unauthenticated network listener that, once a rule and a route are configured, can start an agent session and give it a prompt — so it was brought in only with explicit authorization to add new external dependencies for this category of work, and every security-relevant piece (HMAC signature verification, bounded body reads, credential indirection) was ported faithfully rather than simplified.

## Decision

Two new packages: `packages/webhook/webhook` (`@freddie/freddie-webhook`, ctx key `webhookRuntime`) is the rule registry and Session-creation runtime, depending on nothing beyond what freddie already has (`@freddie/freddie-values`, `@freddie/cordis`, and the agent/workspace/preset services already shipped). `packages/webhook/webhook-github` (`@freddie/freddie-webhook-github`) is the first adapter, registering one exact route on `@freddie/freddie-host-webserver` and verifying `X-Hub-Signature-256` before anything else runs. **New dependency: `@octokit/webhooks` (^14.2.0)**, used solely for its constant-time HMAC-SHA256 `verify()` — no other surface of that library is used.

A rule registers with `ctx.webhookRuntime.register({ id, kind, run })`; `dispatch(delivery)` starts every matching rule and returns immediately, so the HTTP handler can answer the sending provider (GitHub expects a fast response) without waiting for a rule's own work or the agent turn it may start. A rule's `run()` returns `null` or a `WebhookSessionRequest` (workspace path, title, prompt, agent preset, permission preset, optional model override); `createWebhookSession` then creates the agent, mounts the preset from inside `setup()` — the one supported call site for `agentPresets.mount()`, verified against `packages/preset/agent-presets/README.md`'s "Where to call mount()" — attaches the session to its workspace, applies the permission preset, sets the title, and admits the prompt, rolling back the workspace attachment and agent on any failure after creation.

Two adaptations from the upstream source, both because freddie's own architecture already generalized past what dsh does per-plugin:

- **Message source uses freddie's existing `kind: 'plugin'` convention** (`source: { kind: 'plugin', plugin: 'webhook', provider, source, deliveryId, ruleId, summary }`), matching `@freddie/freddie-schedule`'s own plugin-originated messages, instead of upstream's dedicated declaration-merged `webhook` member of a `MessageSourceMap`. Freddie's message source is not runtime-validated against a closed union (buildless JS, "trust TypeScript at typed same-process boundaries"), so this needed no shared type-declaration change — a plugin-owned addition stays plugin-owned.
- **No `agentPresets.acquireScope()` step.** Freddie's `AgentPresets.mount()` is itself single-flight; the separate scope-pinning handle upstream's `acquireScope()`/`await using` pattern manages doesn't have a freddie counterpart because `resolve()` + `mount()` already cover it.

The package invariant (`webhook/invariant`, `@freddie/freddie-webhook/invariant`) verifies at prompt-admission time that a webhook-origin message's session belongs to exactly one workspace whose path matches the session's `cwd` — ported unchanged except for the `kind: 'plugin'` filter.

## Alternatives considered

**Add a dedicated `kind: 'webhook'` message-source variant via declaration merging, matching upstream exactly.** Rejected: this would touch a shared type surface every message-source consumer reads, for a distinction (`kind: 'plugin', plugin: 'webhook'` vs. a bespoke `kind: 'webhook'`) that carries the identical information. `@freddie/freddie-schedule` already established the generic path for exactly this situation.

**Have `webhook-github` call `ctx.agents.create` directly instead of going through the separate `webhookRuntime` registry.** Rejected: matching upstream's split keeps provider-specific authentication (`webhook-github`) independent of session-creation policy (`webhook`), so a second provider adapter (GitLab, a generic HMAC webhook) is a new adapter package with no changes to the runtime, and a deployment can register rules without any HTTP adapter loaded at all (e.g. for a future non-HTTP delivery source).

## Consequences

Freddie can now be configured to start agent sessions from an authenticated external event. Verified live: a real `@octokit/webhooks` sign/verify round-trip and a fully exercised HTTP handler (valid signature accepted and dispatched with the delivery correctly normalized, invalid signature rejected with no dispatch, non-POST rejected) against a stubbed `ctx`; the `WebhookRuntime` registration/dispatch/disposal lifecycle (kind-based filtering, synchronous malformed-delivery rejection, duplicate-id rejection, disposal draining) against a real `@freddie/cordis` `Context` and the actual `Service` base class. `pnpm run publint` passes (227/227). A full CLI headless boot regression-checked cleanly after the install (webhook packages are not wired into any shipped profile, so this only confirms no collateral damage).

`createWebhookSession`'s full path — `agentPresets.resolve`/`mount`, `workspaceRegistry.create`/`attachSession`, `permissionPresets.resolve`/`set`, `sessionTitle.rename`, `agents.create` — was verified by cross-checking every call against freddie's real, current service source (not assumed from the upstream port), but not exercised end-to-end in a running composition; that would need a configured preset/workspace fixture beyond this change's scope. No adapter or rule is loaded in any shipped profile, so this capability ships inert until a deployment opts in by configuring `webhook-github` (with its own credential and route) and registering at least one rule.
