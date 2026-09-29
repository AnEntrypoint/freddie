# AGENTS.md — subagent-acp

## Rationale

- `run.js` `startAcpRun`: the lifecycle id (`parentNamespaceLifecycleId`) is minted in the parent namespace. ACP session ids are unique only within the child server, so fresh processes could collide with each other or with a local agent using the same id.
- Child stdio is `PIPED_PROTOCOL_WITH_INHERITED_DIAGNOSTICS`: diagnostics stay on the parent's stderr and only ACP output contributes to the result. The spawn seam's `scrubbedParentEnv` drops ambient credentials and `FREDDIE_*` names; `spec.env` merges after it.
- `processRejected` never settles on a clean exit (`neverSettles`), so a clean exit cannot win the startup race; a child that exits without speaking ACP is bounded by the ACP connection seeing its streams close. Its bare `.catch` marks it handled because the startup race observes it.
- `observeProcessOutcome` returns `processOutcome` when the provider rejects after handle publication: no direct outcome exists and the active protocol failure stays authoritative.
- Startup cleanup (`needsProcessExitClassification`): a child closing its protocol stream can precede whole-range exit observation. Local cancellation skips the classification; other failures wait the configured process grace.
- `clientCapabilities` is empty (`NO_OPTIONAL_CLIENT_CAPABILITIES`): no fs, no terminal; the child self-serves in its own process.
- Permission requests: policy `allow` selects the first `allow_once`/`allow_always` option; when the child offers none, or policy rejects, the answer is `cancelled` so the child does not proceed.
- Session updates other than assistant text (thoughts, tool calls, plans) are consumed, not surfaced: ACP exposes no complete assistant messages, so `AssistantOutputFold` selects accumulated text and the subagent returns only its final answer.
- `disposeAcpChild`: `terminate()` owns the bounded SIGTERM-to-SIGKILL timer; the unbounded `waitForExit()` after it is the process owner's exit proof, not a second derived grace that can overflow.
- `index.js` cwd handling: a relative configured cwd is resolved once at load against the harness launch directory and a bad directory fails there, not per start. An empty `config.cwd` is rejected because `path.resolve('')` is the process cwd and would silently reintroduce the launch-directory fallback; the cwd probe treats any `statSync`/`accessSync` filesystem error as "cannot serve as the child's cwd".
- `index.js` `onError`: the seam forbids `result` rejecting, so a child-level failure is flattened to a stop reason and logged here instead of being lost. `inheritsParentContext` is `false`: an out-of-process ACP child starts fresh and no parent conversation crosses the process boundary.
