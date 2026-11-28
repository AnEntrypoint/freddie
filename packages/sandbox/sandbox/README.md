# @freddie/freddie-sandbox

Process-sandbox Service Definition. Owns the `ctx.sandbox` service contract (`LocalSandboxProvider.confine`, `src/provider.js`) and the confinement vocabulary the harness shares: `SandboxMode` (`read-only` / `workspace-write` / `danger-full-access`, file effects only), `SandboxEnforcement` (`full` / `partial`, per kernel ABI), `SandboxExecutionPolicy` (the complete per-call mode + workspace root), `SandboxPolicy` (its confined subset), and the fail-closed `SANDBOX_UNAVAILABLE` error. As the Service Definition role of the [capability-seam split](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md), it depends only on cordis (+ the harness error base), never on a backend.

The contract in one line: `ctx.sandbox.confine(argv, policy)` returns the argv to spawn INSTEAD of your own — wrapped so the process (and everything it spawns) runs confined — plus the selected backend's enforcement completeness, denial dialect (`denialSignatures`), and structured runner-failure evidence (`runnerFailureRules`); when no backend is usable it throws rather than passing the argv through unconfined. The [core type catalog](../../../docs/subsystems/sandbox.md#wrapped-argv-and-classification-dialects) owns the exact classifier shape.

Policy rides the call, not the provider: two consumers may confine under different policies at the same instant (bash under `read-only` while a confined child agent keeps its state directory writable), and an approved escalated retry is just a new call with a wider policy.

**Same-world confinement only.** A backend shares the host's filesystem and kernel (`bwrap`, Landlock, Seatbelt); `workspaceRoot` names the filesystem-canonical real host directory. Workspace identity is resolved before lexical normalization, so a valid cwd containing `symlink/..` grants the directory where `chdir` actually lands rather than an unrelated lexical parent. Containers, microVMs, and remote executors are NOT backends of this seam — they replace the Service Providers for whole capability seams (`ctx.shell`, `ctx.fs`) as environment-coherent groups. The boundary and its rationale: [the sandbox Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

One plugin holds the contract, its one implementation (`src/provider.js`: Linux `bwrap`, else the per-platform Landlock launcher; macOS `sandbox-exec`/Seatbelt) and the policy home (`src/policy.js`). Consumers: [`@freddie/freddie-bash-sandbox`](../../shell/bash-sandbox/) (wraps `['bash', '-c', command]`).

## Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `read-only` / `workspace-write` / `danger-full-access` | `read-only` (fail-safe) | Deployment default `SandboxMode`, validated at load |
| `workspaceRoot` | string | `process.cwd()` | Fallback directory `workspace-write` may write under for agentless calls or sessions without a cwd, resolved to its absolute filesystem identity either way; a normal agent call uses its session header's immutable `cwd` |
| `runnerCommand` | string[] | `[]` (use the platform chain) | Operator-supplied runner argv prefix; requires `runnerFailureSignatures` |
| `runnerFailureSignatures` | string[] | `[]` | Non-empty single-line fatal-stderr markers for the custom runner; requires `runnerCommand` |
| `probeTimeoutMs` | natural | `5000` | Timeout for each runner probe |

## The local provider

Local implementation of the [`freddie-sandbox`](../sandbox/) seam. It selects and caches one platform runner: Linux prefers a working `bwrap` then Landlock; macOS uses Seatbelt. Multiple candidates are probed in order, while a sole candidate is selected directly.

Unsupported platforms and unusable runners fail closed with `SANDBOX_UNAVAILABLE`; execution never silently falls through unconfined. Each wrap carries structured runner-failure rules so consumers can distinguish a broken sandbox from a command failure.

Policy is per call; the provider stores only the mechanism and cached runner verdict. Each wrap reports enforcement completeness plus backend-specific denial signatures and runner-failure rules. Landlock requires exit 125 and a `landlock-run:` fatal line after excluding only the exact partial-enforcement notice; a notice with child exit 1, 2, or 125 remains a child outcome. Bubblewrap and Seatbelt remain signature-only because neither public contract reserves a launcher-failure status. Consumers spawn the returned argv directly, so a missing or unexecutable runner is an out-of-band spawn failure while a successfully launched child exit 126 or 127 remains ordinary. `runnerCommand` skips probes and requires one or more non-empty, single-line, case-insensitive `runnerFailureSignatures` entries for the custom runner's own fatal dialect. Because its mechanism is unknown, it carries both Linux denial dialects. `probeTimeoutMs` bounds functional probes. The [sandbox Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) owns selection and failure semantics.

The bwrap profile combines a read-only host root, fresh `/dev`, and private-PID `/proc`. Commands manage descendants but cannot see host processes; hiding host `/proc/<pid>` entries prevents magic links such as `root` and `fd` from bypassing its mounts. `workspace-write` adds ephemeral `/tmp` and a writable workspace bind. The [private-PID Agent Note](../../../.agents/notes/implemented/bug-fix/2026-08-06-bwrap-private-pid-namespace.md) records the boundary.

The Seatbelt profile is allow-default with `(deny file-write*)` plus write allow-lists, so exactly the mode's promised file effects are governed: `read-only` grants the `/dev/null` literal alone; `workspace-write` adds the workspace root, `/tmp`, and the per-user darwin temp dir (`os.tmpdir()` — the platform's real temp area for mkstemp-family tools), every root canonicalized because Seatbelt matches resolved paths (`/tmp` IS `/private/tmp`). Apple marks the `sandbox-exec` CLI deprecated but ships it on every macOS; the functional probe is what fails closed if that ever changes.

[`@freddie/node-addon-landlock-run`](https://www.npmjs.com/package/@freddie/node-addon-landlock-run) supplies the platform launcher, functional probe, and CLI argument vocabulary. This provider owns only mode-to-grant mapping and runner selection. Keeping path resolution and probe parsing with the versioned binary prevents contract drift.


## The policy home: `ctx.sandboxPolicy`

The single owner of sandbox-policy resolution: the deployment's default [`SandboxMode`](../sandbox/README.md) and fallback root, plus each session's durable mode override and immutable workspace root. Every enforcing capability receives one resolved mode-and-root policy per call; before each request, the model receives the current policy without a separate capability inventory.

### Why a shared home

Filesystem tools, one-shot bash commands, and terminal sessions may enforce the same mode vocabulary in different combinations. If each resolved its own `mode` + `workspaceRoot`, they could drift into a split world, exactly what [the sandbox Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) warns against. Each enforcing backend consumes the complete owner-resolved policy, while the current context describes only what that policy means for any available operation the FREDDIE file sandbox enforces. The [cross-family fs sandbox Agent Note](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md) records the shared-policy decision.

### API

- `ctx.sandboxPolicy.resolve({ session?, mode? })` — resolves one complete per-call policy. An explicit approved mode outranks the session's last `sandbox/mode` event, which outranks `defaultMode`; the session's immutable `cwd` is canonicalized with filesystem semantics before becoming `workspaceRoot`, otherwise the configured fallback applies. Canonicalization precedes lexical normalization so `symlink/..` agrees with process working-directory resolution.
- `ctx.sandboxPolicy.defaultMode` / `ctx.sandboxPolicy.workspaceRoot` — the deployment default and fallback root used by `resolve()`.
- `sandbox:policy` — a request-time cache-safe context contribution derived directly from `resolve({ session })`. It states the mode's capability-neutral file-effect contract and the canonical session workspace under `workspace-write`; tool owners retain operation-specific denial and escalation guidance.
- `effectiveSandboxMode(events)` — the pure fold of a session's `sandbox/mode` events (the last switch wins, or `undefined`), used inside `resolve()`.
- `setSandboxMode(session, mode)` — THE write path for a per-session override: appends exactly one `sandbox/mode` event. The switch IS its event; nothing mutates the mode out of band.
- `SANDBOX_MODES` — every mode, for option advertisement and runtime validation.

### The per-session store

A runtime switch is one log-only `sandbox/mode` event on the session it applies to. `effective = explicit grant ?? fold(events) ?? deployment default`, so an override survives restart by replay and two sessions never see each other's state. Workspace identity does not need another event: the immutable `SessionHeader.cwd` recorded at creation is the root for every call in that session. The event stays log-only; before the next request, the owner contributes the current fact to the full runtime-context snapshot.

## Model Experience

### Confinement error, indirectly

#### What the model sees

Through [`freddie-bash-sandbox`](../../shell/bash-sandbox/README.md) and [`freddie-tool-bash`](../../shell/tool-bash/README.md), failure to enforce a requested mode produces code `SANDBOX_UNAVAILABLE` and the exact error below. An execution-time runner failure adds ` Runner failure: <detail>`.

##### Exact error

```markdown
sandbox mode "<mode>" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing kernel (Linux), or ensure sandbox-exec is usable (macOS) — otherwise switch the consumer to danger-full-access.
```

#### Token effect

Conditional error text is visible for that call and retained in history until compaction.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Current file sandbox policy

#### What the model sees

One `sandbox:policy` contribution in the current runtime-context snapshot for every agent session. It does not enumerate mounted capabilities. Tool plugins retain operation and escalation guidance, approval policy contributes separately to the same snapshot, and plan guidance remains `freddie-plan-mode`'s system section.

##### Read-only

```markdown
Current FREDDIE file policy: read-only. Any available operation enforced by the FREDDIE file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.
```

##### Workspace-write

```markdown
Current FREDDIE file policy: workspace-write. Any available operation enforced by the FREDDIE file sandbox may modify files under the session workspace: "<workspace root>". Some platform temporary areas may also be writable.
```

##### Danger-full-access

```markdown
Current FREDDIE file policy: danger-full-access. The FREDDIE file sandbox does not restrict file modifications by available operations. Do not set sandbox_permissions: no wider mode exists.
```

#### Token effect

One concise durable context message on the first request and each effective policy change; unchanged requests add nothing. `workspace-write` carries only the canonical session workspace path; platform-specific temporary paths are summarized without adding host-dependent bytes.

#### KV Cache effect

The stable system prompt remains byte-identical across mode changes. A changed full context snapshot is appended after retained history, preserving the prior cached prefix; subsequent unchanged requests reuse that retained snapshot.

## Known Limitations and Deferred Work

- **File effects are the whole policy vocabulary** — the seam expresses no network, process, syscall, device, or credential restrictions.
- **Same-world confinement only** — containers, microVMs, and remote execution require replacing capability implementations rather than adding a provider here.
- **Denial reporting is a stderr dialect** — the seam returns backend signatures instead of a typed runtime denial channel, so consumers that need classification must infer it from the child process's output.
- **Runner diagnostics are in-band** — exit status plus stderr evidence cannot prove which process wrote a matching line, so a confined child that deliberately mimics its runner can cause an availability/diagnostic false attribution. This cannot bypass confinement; an out-of-band runner-status channel is deferred.
- **One provider per context** — composing different sandbox mechanisms simultaneously requires a provider-level ladder or separate Cordis contexts; callers choose policy per call, not backend identity.
- **One primary workspace root per session** — policy resolves `SessionHeader.cwd`; extra writable roots are not part of `SandboxExecutionPolicy`.
- **File-effect modes only** — `SandboxMode` governs file effects; network and process policy are outside its vocabulary, so no knob here restricts them.
- **Temporary areas are deliberately summarized** — enforcing backends grant different platform temporary areas, which are selected after policy resolution and therefore cannot be enumerated truthfully in the current context.
- **Landlock may be partial** — older supported kernel ABIs confine only the access classes they expose, reported as `enforcement: 'partial'` rather than overstated as full.
- **Seatbelt depends on deprecated `sandbox-exec`** — macOS still ships it, but this provider cannot replace or probe that private policy engine if Apple removes it.
- **Runner selection is cached for the provider lifetime** — installing, removing, or repairing a runner requires reloading the plugin before selection changes.
- **`runnerCommand` is an operator assertion** — a configured custom runner skips functional probes and is assumed to implement the bwrap-compatible profile honestly; if it is itself a Bash script, its interpreter startup runs before that script applies confinement.
