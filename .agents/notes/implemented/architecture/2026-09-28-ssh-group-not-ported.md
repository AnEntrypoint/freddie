# Agent Note: dsh `packages/ssh/` — assessed, deliberately NOT ported

Status: assessed — not ported (deliberate, evidence-backed)

## Problem

The dsh-gap audit left `packages/ssh/` as the last never-assessed bucket: `ssh/ssh`,
`ssh/fs-ssh`, `ssh/sandbox-ssh`, `ssh/subprocess-ssh`. freddie has no `packages/ssh/` group,
no `ctx.ssh` service, and no remote execution world. The question was whether the family is
portable into freddie's buildless plain-JS / Cordis / Node+pnpm stack without a stack change
and without a new npm dependency.

## Verdict

| Package | Verdict | Decisive reason |
|---|---|---|
| `ssh/ssh` | **NOT PORTABLE** | Needs a pre-built, pre-installed, SHA-256-pinned remote helper agent; POSIX-client-only (hard throw on win32); needs OpenSSH Unix-socket forwarding; ships `lib/` from TS emit |
| `ssh/fs-ssh` | **NOT PORTABLE** | Pure `ctx.ssh.request()` forwarder; `static inject = ['ssh']` — inert without `ssh`. Also overrides `readByteRange`, absent from freddie's `FileSystem` seam |
| `ssh/sandbox-ssh` | **NOT PORTABLE** | Pure `ctx.ssh.request()` forwarder; `static inject = ['ssh']` — inert without `ssh` |
| `ssh/subprocess-ssh` | **NOT PORTABLE** | Pure `ctx.ssh.request()` / `ssh.connectStream()` forwarder; `static inject = ['ssh']` — inert without `ssh`. Also overrides `terminalEnvironment`, absent from freddie's `SubprocessRuntime` seam |

## Evidence on the four axes

### 1. Native binary or desktop/app framework

No Electron or desktop framework is involved. But `ssh` **shells out to the OpenSSH client
binary**, not to an npm library: `spawn('ssh', ['-T','-M','-S', <controlPath>, ..., host, command])`
and `execFile('ssh', ['-O','forward','-o','ExitOnForwardFailure=yes','-L', <local>:<remote>])`
(`packages/ssh/ssh/src/index.ts`). Both `<local>` and `<remote>` are **Unix-domain socket paths**
created under `mkdtemp('/tmp/dsh-ssh-')`. Windows OpenSSH does not forward Unix sockets, so the
mechanism is unavailable on the class of host freddie is developed and gated on
(`packages/bundle/base` gates both shell stacks on `process.platform === 'win32'`).

Verified live on this host (`exec_js`):
`platform: win32`, `ssh` on PATH = `C:\Windows\System32\OpenSSH\ssh.exe`,
`ssh -V` = `OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2`, `packages/ssh` absent,
`pnpm-workspace.yaml` carries no `ssh` group.

### 2. DeepSeek-vendor-specific

**No.** The `@deepseek-ai/*` scope is naming only. There is no account, endpoint, product
identity, or DeepSeek host anywhere in the four packages; config is a deployment-owned OpenSSH
alias plus remote paths. This axis does not block the port — it is recorded because the audit
asks for it, and because "vendor-specific" would have been a cheap but wrong reason to skip.

### 3. Build step / TypeScript emit

**Yes, for all four.** Every `package.json` ships `main: lib/index.js` with
`types: lib/types/index.d.ts` and `files: ["lib/index.js", "lib/types/**/*.d.ts"]`; sources are
`src/*.ts` with `.ts`-suffixed relative imports (`import ... from './protocol.ts'`). `ssh`
additionally exports `./helper` → `lib/helper.js`. freddie is buildless plain JS with JSDoc.

This axis alone is *mechanically* surmountable — that is the weakest of the blockers. It is
listed to be explicit that the verdict does not rest on it.

### 4. Does freddie have the seam it registers onto

Mixed, and decisively so:

- **Present:** `ctx.sandboxPolicy` (`packages/sandbox/sandbox-policy/src/index.js`,
  `super(ctx, 'sandboxPolicy')`, exposing `defaultMode`, `resolve()`, `workspaceRoot`) — exactly
  what `fs-ssh`'s `static inject = ['ssh', 'sandboxPolicy']` expects.
- **Present, base classes exist:** `FileSystem` (`packages/fs/fs/src/index.js:25`),
  `SubprocessRuntime` (`packages/subprocess/subprocess/src/index.js:75`),
  `SandboxProvider` + `SandboxUnavailableError` (`packages/sandbox/sandbox/src/index.js:55`/`:34`),
  with a matching vocabulary: `SandboxMode` = `read-only` | `workspace-write` |
  `danger-full-access`, `SandboxEnforcement` = `full` | `partial`,
  `SandboxExecutionPolicy`, `ConfinedArgv`.
- **Absent:** no `ctx.ssh` service anywhere in the tree.
- **Divergent at the edges** (the seams are similar, not identical):
  - freddie's `FileSystem` has **no `readByteRange`** — `fs-ssh` overrides it; the override would
    be orphaned, and the remote helper calls `ctx.fs.readByteRange(...)`.
  - freddie's `SubprocessRuntime` has **no `terminalEnvironment()`** — `subprocess-ssh` overrides
    it and the helper calls `ctx.subprocess.terminalEnvironment(signal)`.
  - freddie's `SandboxProvider.confine(argv, policy)` takes **two** parameters, no `AbortSignal`;
    upstream's takes three, and the helper calls it with a signal.

## The decisive blocker: the remote helper is a second runtime, not a package

`packages/ssh/ssh/src/helper.ts` is a **Node program that runs on the remote host** and mounts
dsh's entire local provider stack there:

```js
const ctx = new Context()
await ctx.plugin(SessionProjectionRegistry)
await ctx.plugin(SandboxPolicyService, { mode: 'read-only', workspaceRoot: process.cwd() })
await ctx.plugin(SandboxedFileSystem, { cwd: process.cwd() })
await ctx.plugin(LocalSubprocessRuntime)
await ctx.plugin(LocalSandboxProvider)
```

It additionally imports `./helper-processes.ts`, `./protocol.ts`, `./schemas.ts` (the client side
also needs `./stream-security.ts`), and the client verifies the installed entry against a
configured SHA-256 (`helperHash`) plus an optional paired PTC `bootstrapHash`.

Porting `ssh` therefore means: authoring a remote agent that bundles freddie's
`freddie-fs-sandbox`, `freddie-subprocess-local`, `freddie-sandbox-local`,
`freddie-sandbox-policy` and session projection, **emitting it as a bundled installable
artifact**, pre-installing it (and Node) on every target host, and pinning its digest. freddie
has no bundler and no emit step, so there is no artifact to hash. That is not a port of
`packages/ssh/`; it is building a new distributed subsystem. Upstream's own README states the
prerequisite plainly: "Install the built helper and its matching runtime dependencies on the
remote host."

Because all three sibling packages are pure RPC forwarders onto `ctx.ssh`, they carry zero value
without it. Shipping them would be shipping stubs — explicitly out of scope for this audit.

## Security posture, assessed

Upstream's defaults here are the **right** ones and a port must not weaken them:
`BatchMode=yes`, `StrictHostKeyChecking=yes`, `ForwardAgent=no`, `ClearAllForwardings=yes` —
deny-by-default on an unknown host key, no interactive auth fallback, no agent forwarding.
This audit introduces no "disable host-key verification for convenience" flag and no credential
path. The one thing a freddie port would have to add deliberately is the platform guard's twin:
freddie's `SubprocessRuntime` scrubs credential-shaped env (`SENSITIVE_ENV_PATTERN`), which dsh's
remote spawn spec does not; a remote port would have to carry that scrub across the wire rather
than inherit it.

## Alternatives considered

- **Port the three adapters only, defer `ssh`** — rejected: they `inject = ['ssh']` and every
  method is a `ctx.ssh.request()` call. They cannot load, let alone run.
- **Port `ssh` but talk to a plain remote `node -e` instead of the bundled helper** — rejected:
  the digest-pinned helper *is* the design; without it there is no `hello`, no stream reservation,
  no `RemoteOperationError` codes, and no managed remote cleanup.
- **Rewrite in JS/JSDoc and accept the win32 throw as "POSIX-only"** — rejected: an SSH layer
  handling private keys, known-host data and remote command execution that cannot be constructed
  or exercised on this host cannot be verified live, and shipping it unverified violates
  fail-safe defaults (Saltzer & Schroeder).
- **Add an npm SSH library (`ssh2`) instead of shelling out** — not proposed by upstream, not
  needed, and a new dependency. See below.

## Dependency question — resolved, no new dependency

The anticipated blocker does not arise. Upstream uses **no npm SSH library**: it shells out to
the OpenSSH `ssh` binary. The four packages' only runtime dependencies are
`@deepseek-ai/schemastery` (workspace) and `zod ^4.4.3`.

`zod` is **already in freddie at exactly that version** — `pnpm-lock.yaml` resolves `zod@4.4.3`
from specifier `^4.4.3` (declared by e.g. `packages/util/chunked-list`, and used by
`packages/mcp/mcp-client/src/tools.js` and the generated typert faces). So no `allowBuilds` edit
and no new dependency is required by this bucket.

The real external requirement is not an npm package but a **host + deployment prerequisite**: a
POSIX client, an OpenSSH install with Unix-socket forwarding, a POSIX server, a pre-installed
remote Node, and a pre-installed digest-pinned helper bundle.

## Consequences

`packages/ssh/` stays absent in freddie; no group README, no `packages/README.md` row, no
package stubs. This note is the durable record so the audit does not re-open the bucket. If
freddie ever wants remote execution, the work is a remote-execution-world seam (provider-owned
paths, remote target identity, a transport with managed remote cleanup) authored to freddie's
own seams and verified against a real server — not a translation of dsh's `ssh/` group.

Nothing was shipped, so `node scripts/publint-all.js` has no new packages to check; it was run
as a no-regression baseline.
