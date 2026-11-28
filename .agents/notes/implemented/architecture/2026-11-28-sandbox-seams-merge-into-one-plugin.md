# Agent Note: The sandbox seams merge into one plugin

Status: implemented

## Problem

The sandbox family was three packages: `sandbox` (an abstract `SandboxProvider`, the escalation ladder and the writable-roots derivation), `sandbox-local` (the one provider: bwrap, Landlock, Seatbelt) and `sandbox-policy` (the per-call policy resolver, the session mode events and the runner-failure classifier). The abstract class had one subclass, the provider package had one consumer-facing row, and the two bundle rows always loaded together, so the layering added packages, rows and a second config block without a second provider to justify them.

## Decision

`@freddie/freddie-sandbox` is one function plugin with one config: `mode`, `workspaceRoot`, `runnerCommand`, `runnerFailureSignatures` and `probeTimeoutMs`. `apply` constructs `LocalSandboxProvider` (`ctx.sandbox`, `src/provider.js`) and `SandboxPolicyService` (`ctx.sandboxPolicy`, `src/policy.js`). The abstract `SandboxProvider` class is gone; `LocalSandboxProvider` extends `Service` directly. The escalation vocabulary, roots, the session-mode fold, the denial and runner-failure classifiers and `SandboxUnavailableError` keep their names and are exported from the one package entry, so consumers only changed the module they import from. `sandbox-local` and `sandbox-policy` are deleted along with their bundle row, and the base bundle has one `sandbox` row.

The witness was the four profile dumps: each differs from before by exactly the two old rows collapsing into one `@freddie/freddie-sandbox` row, import smoke counts 240 packages with the same two expected failures, and release verify counts 226 members. The profiles boot (web 200, acp and sdk initialize) and a real context with the merged plugin provides both services, resolves a policy and fails closed with the documented error. This host blocks user namespaces and Landlock (`bwrap` and the launcher probe both report unusable), so real confinement of a command could not be exercised here.

## Rejected

- Keeping the abstract class for a second provider. No second provider exists in the tree; if one is added, it extends `Service` the same way, or the seam returns with it.
- Splitting the config into `provider` and `policy` blocks. One row, one config, flat keys: the bundle carried `mode` and `workspaceRoot` only, and the runner keys keep their names.

## Gave up

`@freddie/freddie-sandbox` now pulls the Landlock addon and the agent and system-prompt peers into every consumer's install, including consumers that only read the escalation vocabulary. The sandbox row is in the base bundle, so every shipped profile loaded all three packages already.
