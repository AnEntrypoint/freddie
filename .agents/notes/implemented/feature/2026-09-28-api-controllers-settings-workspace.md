# Agent Note: Remote API controllers for settings, workspace, and workspace files

Status: implemented

## Problem

freddie had already ported dsh's Remote *transport* — `packages/api/remotes`, `packages/api/gateway`, `packages/client/connection`, `packages/host/webserver`, `packages/host/apiproxy` — but none of the **controller** packages that give that transport something to dispatch. `docs/` and `packages/api/README.md` described the stack, and `packages/client/connection` already guards a set of privileged method names (`settings.describe`, `credentials.set`, …), but no Host service answered any of them: the table in `packages/api/README.md` listed exactly two rows, and the legacy API Proxy was the only thing serving those calls.

## Gate: does any of this need `packages/typert/generator`?

No — verified, not assumed. The upstream `package.json`s export `./typert` → `lib/typert.host.js` and `./remote` → `lib/typert.remote-client.js`; those are **untracked build outputs** upstream (`files: ["lib/**"]`, `scripts.bundle: tsdown`, no `lib/` in the tracked tree), and upstream's `settings-controller/src` has no client directory at all. freddie already hand-owns the equivalent artifacts as **tracked source** in nine packages (the pattern copied here is `packages/session/session-artifacts`: `src/typert.remote-client.js` exporting `TYPERT_REMOTE`, `src/typert.host.js` exporting `TYPERT`), and `packages/typert/loader` imports `./typert` and calls `ctx.typert.register(manifest)`. Nothing on the runtime path needs generated code, so the three manifests here are hand-owned in the same shape. **No generated artifact was fabricated.**

## Decision

Three new packages, each ported from `deepseek-ai/deepseek-harness`'s tracked source read from `raw.githubusercontent.com` (listed via the GitHub contents API) — never from a README, a note, or a recollection.

| Package | Services (ctx key → namespace) | Verbs |
|---|---|---|
| `packages/api/settings-controller` | `settingsController` → `settings`, `credentialsController` → `credentials` | `describe`/`update`/`replace`/`mutate`, `describe`/`set`/`unset` |
| `packages/api/workspace-controller` | `workspaceController` → `workspace`, `directoryPickerController` → `directoryPicker` | `list`/`create`/`rename`/`delete`/`insertBefore`/`insertSessionBefore`/`archiveSession`, `pick`/`list`/`createDirectory` |
| `packages/api/workspace-files` | `workspaceFiles` → `workspaceFiles` | `stat`/`read`/`readBytes`/`list` |

Each package ships `src/index.js`, `src/typert.remote-client.js`, `src/typert.host.js`, `src/invariant.js`, `README.md`, and a `package.json` with the sibling's `main: "src/index.js"` and `exports` for `.`, `./invariant`, `./remote`, `./src/*`, `./typert`, `./package.json`. `@deepseek-ai/dsh-*` maps to `@freddie/freddie-*` by substitution; all peers are `"*"` in both `peerDependencies` and `devDependencies`.

### Adaptations, each forced by a freddie contract upstream does not share

- **No `RemoteError`.** freddie's `packages/typert/protocol` has no error class, so every typed failure rides the business envelope as `{ ok: false, error: { code, message, …details } }`. Upstream's error codes are kept verbatim (`settings/rejected`, `settings/conflict`, `credential/rejected`, `workspace/not-found`, `workspace/move-invalid`, `directory-picker/unavailable`, …) so a Client keeps one vocabulary.
- **Unary only.** `packages/api/gateway` dispatches unary methods only, so `workspace.follow` and `workspaceFiles.changes` have no counterpart; `workspace.list` is the snapshot a Client re-reads instead.
- **No `ctx.resources`.** workspace-files' Client resource provider and change feed are unported. The request carries an explicit `sessionId`, and no Typert lookup is registered for workspace-file scoping.
- **Redaction is re-read, never cached.** `settings.update/replace/mutate` rebuild the answer from `describe({ redactSecrets: true })` *after* the write commits, so a redacted view can never be written back over its own secrets.
- **Optional providers.** freddie mounts settings and credentials optionally, so both controllers resolve `ctx.get(...)` per call and answer `settings/unavailable` / `credentials/unavailable` instead of failing the load. Upstream assumes both are always present.
- **`directoryPicker` is a discriminated capability.** A verb needing a capability the composed backend does not serve answers `directory-picker/unavailable` naming the kind it does serve, so the Client hides the affordance — the documented default for an unknown kind.
- **`readBytes` returns base64**, because the gateway's `assertJsonValue` rejects a `Uint8Array`.
- **Write verbs are absent from workspace-files**: this namespace is read-only.

### Deliberately NOT ported

- `openSettingsDocument` / `settings.openDocument` — the only real implementation in freddie is `openNativeTextFile` in `packages/host/apiproxy/src/native-path-opener.js`, reachable from an api package only through the deep `./src/*` escape hatch; duplicating cross-platform desktop-open logic would fork the platform matrix. freddie already serves the gesture loopback-pinned as `settings.openDocument`.
- `workspace.initializeDefault` — freddie's registry has no bootstrap call, and upstream's `defaultWorkspaceDirectory` joins a `'deepseek-harness'` path segment (vendor-specific, excluded by the port's rule).
- `pinSession` / `unpinSession` / `unarchiveSession` — freddie's `WorkspaceEntity` exposes no seam.
- Upstream's `tsconfig.json`, its localized README, and tests — no build step and no test files in this repository.

## Security posture

`settings-controller` and `workspace-files` are trust boundaries: one exposes configuration writes, the other filesystem reads, both over a Remote call. Both deny rather than allow.

- **Fail-closed providers.** No `ctx.settings` / `ctx.credentials` → `unavailable`, never a fabricated default and never a partial answer.
- **Fail-closed filesystem root.** No session cwd and no `ctx.sandboxPolicy.workspaceRoot` → `workspace-file/root-unavailable`. A read with no boundary is never served. Root resolution reads the **session's immutable cwd** first and the sandbox policy's workspace root second — the real seams named in the assignment — and never opens raw filesystem access.
- **Containment proven after resolution, not assumed from the string.** Every target goes through `ctx.fs.resolve` (which follows symlinks to a stable identity) and then `ctx.fs.contains(rootTarget, target)`, so `..` traversal *and* a symlink pointing out of the workspace are both refused as `workspace-file/outside-workspace`.
- **The byte cap lives at the filesystem seam.** Reads go through `ctx.fs.readBytes(target, signal, maxFileBytes)` — the one primitive whose bound the backend enforces — so an oversized file is refused with `workspace-file/too-large` rather than decoded whole into the host process. Windows are cut after that: `maxBytes` per `readBytes`, `maxLines` per `read`, `maxEntries` per `list` (with `truncated` flagging a cut, never a silent one).
- **Binary is refused, not coerced.** `read` decodes with `TextDecoder('utf-8', { fatal: true })` and rejects a NUL byte, answering `workspace-file/not-text`.
- **No credential value and no file body reached a log or a scratch file.** The verification below prints only `configured`/`source`/`writable`; the one credential written went to a temporary `$FREDDIE_HOME` that the run deleted, and the scratch tree was removed at the end of the same run.

### Open risk surfaced, not silently fixed

`PRIVILEGED_METHODS` in `packages/client/connection/src/index.js` pins privileged endpoints to loopback by **legacy dotted** names derived from the URL path (`settings.describe`, `credentials.set`, …). A Typert endpoint dispatches as `settings/describe`, which is a different string, so the new Typert settings/credentials/workspace endpoints are **not** covered by that fence and would be reachable off-loopback wherever Connection's trust model already allows a call. Left alone deliberately: the fence is shared with sibling work in this worktree and an additive edit there is a connection-layer decision, not an api-package one.

## Verification (live, real code and real state — no stubs, no mocks)

One script composed a real cordis `Context` with the real `TypertRegistry` (`packages/typert/registry`), the real `TypertGatewayService` (`packages/api/gateway`), the real `FileSettingsProvider`, `LocalCredentialProvider`, `LocalFileSystem`, `SandboxPolicyService`, and `BrowseDirectoryPicker`, registered the three hand-owned host manifests through `validateTypertManifest` (`packages/typert/loader`) and `ctx.typert.register`, and called every served verb through `ctx.typertGateway.invokeRpc(...)` — the same entry Connection's `/api` interceptor uses. The script was deleted afterwards.

```
=== 1. real typert-loader manifest validation + endpoint resolution ===
@freddie/freddie-api-settings-controller -> ... registered: true
@freddie/freddie-api-workspace-files -> ... registered: true
@freddie/freddie-api-workspace-controller -> ... registered: true
settings endpoints: settings/describe settings/update settings/replace settings/mutate credentials/describe credentials/set credentials/unset
workspaceFiles endpoints: workspaceFiles/stat workspaceFiles/read workspaceFiles/readBytes workspaceFiles/list
workspace endpoints: workspace/list workspace/create workspace/rename workspace/delete workspace/insertBefore workspace/insertSessionBefore workspace/archiveSession directoryPicker/pick directoryPicker/list directoryPicker/createDirectory

=== 2. real Remote markers + namespaces ===
ctx keys: settingsController=true credentialsController=true workspaceFiles=true directoryPickerController=true
settingsController: [{method:describe},{update},{replace},{mutate}] settings
credentialsController: [{describe},{set},{unset}] credentials
workspaceFiles: [{stat},{read},{readBytes},{list}] workspaceFiles
directoryPickerController: [{pick},{list},{createDirectory}] directoryPicker
workspaceFiles config: {"maxBytes":8,"maxFileBytes":64,"maxLines":2,"maxEntries":2}

=== 3. settings + credentials over the real gateway ===
settings/describe: {ok:true,value:{writable:true,hasDocument:true,namespaces:[]}}
credentials/describe (unset): {configured:false,writable:true}
credentials/set: {}
credentials/describe (set): {configured:true,source:"file",writable:true}
credentials/unset: {}
credentials/describe (unset again): {configured:false,writable:true}
credentials/set (bad ref): {code:"credential/rejected",message:"credential ref \"not a ref\" must match /^[A-Za-z_][A-Za-z0-9_]*$/",ref:"not a ref"}
settings/update (unknown namespace): {code:"settings/rejected",message:"settings namespace \"agent\" is not registered",ns:"agent"}

=== 4. workspaceFiles over the real gateway (bounded, confined) ===
stat note.txt: {absolutePath:"…\ws\note.txt",version:"444775593:…",bytes:23}
read page 1: {offset:1,text:"alpha\nbeta",lines:2,eof:false}
read page 2: {offset:3,text:"gamma\ndelta",lines:2,eof:false}
readBytes window: {offset:6,encoding:"base64",data:"YmV0YQpnYW0=",eof:false}
list root: {path:"",entries:[{name:"note.txt",type:"file",size:23},{name:"sub",type:"directory"}],truncated:false}
list sub: {path:"sub",entries:[{name:"inner.txt",type:"file",size:6}],truncated:false}
escape ../outside.txt: {code:"workspace-file/outside-workspace",message:"this path resolves outside the workspace root",path:"../outside.txt"}
missing entry: {code:"workspace-file/not-found",path:"nope.txt"}
list a file: {code:"workspace-file/not-directory",path:"note.txt",kind:"file"}

=== 5. directoryPicker over the real gateway (real browse backend) ===
list: {path:"…\ws",home:"C:\Users\user",crumbs:[…7…],entries:[{name:"sub",…}],truncated:false}
createDirectory: {path:"…\ws\made-by-controller"}
pick (no native backend): {code:"directory-picker/unavailable",message:"directoryPicker.pick needs the native capability; the composed picker serves \"browse\"",capability:"browse"}

=== 6. fail-closed: no provider, no sandbox root ===
bare workspaceFiles config (schema defaults): {"maxBytes":2097152,"maxFileBytes":33554432,"maxLines":5000,"maxEntries":2000}
settings/describe: {code:"settings/unavailable",message:"settings service is absent: this deployment mounts no settings provider"}
credentials/describe: {code:"credentials/unavailable",…}
workspaceFiles/read: {code:"workspace-file/root-unavailable",message:"no workspace root bounds this request",path:"note.txt"}

scratch removed: true
```

Not exercised live, and why: the seven `workspace/*` verbs need `ctx.workspaceRegistry`, whose `Service.init` opens a storage domain and lists session persistence; composing that chain needs a session runtime no api package may reasonably drag in. Those verbs were verified one layer down — the manifest validates, all seven endpoints resolve in `ctx.typert.local`, and the controller's `Remote` markers and namespace are real — and the sibling `directoryPicker` namespace was driven end to end against a real backend.

## Publication

`pnpm exec publint packages/api/{settings-controller,workspace-controller,workspace-files}` → **All good!** for all three. A whole-workspace `pnpm run publint` also reports failures in `packages/api/session-controller`, `packages/api/terminal-controller`, and `packages/llm/llm-pi-ai` — all three are sibling work in progress in this worktree, not these packages.

Nothing was committed; the tree is left dirty on purpose.
