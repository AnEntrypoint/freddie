# Agent Note: Per-tool LLM authorization review (`@freddie/freddie-auto-review`)

Status: implemented

## Problem

freddie's `tools/pre-execute` waterfall is the exact upstream hook `experimental/auto-review` gates, and nothing populated it: a `PreToolDecision` could be `allow`, `deny`, or `ask`, and no composition produced one from a model. The permission-preset table had `workspace-write` and `danger-full-access` and no Auto preset, so "full host access with a review before every call" was unreachable — the one preset whose whole justification is the gate that did not exist. Ported from `deepseek-ai/deepseek-harness`'s `packages/experimental/auto-review/src/index.ts` (741 lines), read from raw.githubusercontent.com and never from a README, a note, or a recollection.

## Gate: the review must be a security control, not a suggestion

Two commits before this work (`c134c5e`) removed a supply-chain dropper from this tree. A component that can **deny** a tool call is therefore a security control here, and Saltzer & Schroeder's fail-safe defaults govern it: deny rather than allow when the policy is unreadable, the reviewer errors, or the model call fails. Auditing upstream first rather than assuming: upstream's `failed(exec, error)` already returns `{kind:'deny', …}` and its listener's only escape hatch is that one function, so **upstream already fails closed and no override was needed** — the port preserves that and, where freddie's vocabulary lacks an upstream safety valve, picks the denying side.

## Decision

New package `packages/interaction/auto-review` (`@freddie/freddie-auto-review`), buildless plain-JS Cordis function plugin.

- `src/index.js` — `export const name = 'auto-review'`; `inject = ['llm', 'permissionPresets', 'approval', 'tools']`; `Config` is a schemastery `z.object`. One prepended `tools/pre-execute` listener, one `ctx.effect(function*(){…}, 'auto-review lifecycle')` owning listener removal, preset withdrawal, and the lifecycle abort.
- `REVIEW_POLICY` is a fixed constant ported verbatim (risk classes, source roles, the six valid output shapes, the no-prose-on-allow rule, fail-closed on ambiguity). It is deliberately not configurable: a caller-supplied policy would make a security control's behavior deployment-dependent and unauditable.
- Fixed source roles: `human-instruction`, `direct-parent-instruction`, `constraint`, `checkpoint`, `fact`. Non-text blocks and tool-produced content are always `fact`; a `compaction/summary` is `checkpoint`. Nothing can acquire the authority of the text it replaced.
- `snapshotAutoReview(ctx, exec)` builds the frozen route plus four data sections and **proves the pending execution is the action the log records** before asking anything: exactly one matching `tool/call` (native) or `tool/code-dispatch-start` (Code Mode inner), with matching name, arguments, and root call. Zero matches, several, or a disagreement denies.

Adaptations, each forced by a freddie difference:

- **No `registerAuto` / `AUTO_PRESET` upstream contribution API.** The plugin adds `auto` → `{ sandbox: 'danger-full-access', approval: 'ask' }` to `ctx.permissionPresets.presets` and deletes it on disposal, skipping both when the table already owns the name. Editing `permission-presets` itself was rejected: several sibling agents are working in `packages/interaction` this session.
- **Gating is on the explicit selection**, `effectivePermissionPreset(session.events) === config.preset`, not on the derived `current(events)`. `auto` is otherwise unreachable, and a derived match would enroll sessions nobody switched.
- **Upstream's `exec.schema` (the PTC binding schema) has no counterpart.** Pending schemas resolve from the latest `request/header` first, then `ctx.tools.get(name, agent)`, so a Code Mode inner call under a collapsed presentation still resolves. An incomplete or absent schema denies rather than reviews.
- **`tool/ptc-dispatch-start` → `tool/code-dispatch-start`**, whose `arguments` is a JSON value rather than a raw string; `parseLoggedArguments` handles both.
- **No `cancel` decision kind.** Where upstream returns `{kind:'cancel'}` on disposal, the port returns `{kind:'deny'}`.
- **No `displayReason`.** `askUser` folds the denial into `reason` only.
- **No `agent-message` or `compact-checkpoint` source kinds**; both fall through as `fact`.
- **`maxInputBytes` rather than an entry cap** (the `freddie-session-title-llm` precedent); exceeding it denies.
- **`export default apply` was written, then deleted.** Live verification caught it: `Loader.unwrapExports` prefers `.default`, which is a bare function carrying no `inject`/`name`/`Config`, so `apply` ran in a fiber with no injected services (`cannot get property "permissionPresets" without inject`) — the exact failure `docs/postmortem/0001-acp-default-export-drops-inject.md` records. No other freddie function plugin has a default export.

**No new npm dependency.** Only `@freddie/schemastery` (runtime) plus `@freddie/freddie-llm`, `@freddie/freddie-permission-presets`, `@freddie/freddie-timeout`, `@freddie/freddie-tools`, and `@freddie/cordis` — all already in the workspace graph. Nothing was added to the supply chain. No build script, so `pnpm-workspace.yaml` `allowBuilds` was not touched.

## Security posture

The gate denies on: a missing or ambiguous logged record; a logged/actual disagreement; no complete request-header route and no configured route; an absent or incomplete pending schema; a prompt over `maxInputBytes`; a reviewer that errors, aborts, times out, or ends without a terminal `finish`; output that is not exactly one JSON object, repeats a member, or is not one of the six valid shapes; and any throw inside the gate itself. The review request goes only through `ctx.llm.stream` and never enters a session log, so reviewer reasoning and raw responses are not persisted — which also means no credential or secret can reach a log, mirror, or scratch file through this path.

## Consequences

Verified live on the real stack — real `Context`, real `SessionStore`, real `Session` (JSONL-free in-memory), real `ToolRuntime` with a real `defineTool` tool, real `ApprovalService`, real `PermissionPresetService` over a real confining `ShellExecutor` subclass, real `LlmRuntime` with a real `LlmAdapter` registered through `ctx.llm.registerAdapter`, driven through the real `ctx.tools.execute` path. Three `exec_js` runs, no mocks. The one host stand-in is the `agent` argument `{ session }`: freddie's `Agent` is a JSDoc type, not an exported class, so there is no constructor to call.

Run 1 — the four required paths plus escalation, Code Mode, and the preset gate:
```
services mounted: sessions=true shell=danger-full-access approval=true tools=true permissionPresets=true llm=true
permissionPresets.names after auto-review load = ["workspace-write","danger-full-access","auto"]
AUTO_PRESET_BUNDLE = {"sandbox":"danger-full-access","approval":"ask","name":"Auto review","description":"Full host access with a model review before every tool call; denied calls ask first."}
effectivePermissionPreset = auto
effective approval policy = ask
[b] low/allow => isError=false | EXECUTED probe_write src/a.txt
[a] high/deny under never => isError=true | Error: Auto review rejected tool "probe_write"; its body was not executed: sensitive data would cross a trust boundary
[c] medium/deny under ask => isError=false | EXECUTED probe_write prod/app.txt
    approval/asked = [{"toolName":"probe_write","reason":"Auto review denied tool \"probe_write\": production write is not explicitly authorized"}]
    approval/decided = ["allowed-once"]
[d] reviewer throws => isError=true | Error: Auto review of tool "probe_write" failed; its body was not executed: auto-review: reviewer ended with error UNKNOWN: probe adapter exploded
[e] low/deny (invalid protocol) => isError=true | Error: Auto review of tool "probe_write" failed; its body was not executed: auto-review: reviewer output does not match the risk/decision protocol
[f] code-inner medium/deny under ask => isError=false | EXECUTED probe_write src/inner.txt
    last review framing = {"provider":"probe","model":"probe-1","temperature":0,"systemStart":"REVIEW_POLIC","sections":["ENVIRONMENT","PROJECT_INSTRUCTIONS","FILTERED_HISTORY","PENDING_ACTION"],"bytes":2506}
[g] workspace-write (not gated) => isError=false | EXECUTED probe_write src/d.txt
    reviews issued while not on auto = 0
tool bodies executed = ["src/a.txt","prod/app.txt","src/inner.txt","src/d.txt"]
review requests observed = 6
```
(a) denied, (b) allowed, (c) escalated to a real `approval/asked` the human answered `allowed-once`, (d) fail-closed on a throwing reviewer, (e) fail-closed on a protocol violation, (f) the Code Mode inner branch reviewed as `code-inner`, (g) no review at all off the Auto preset.

Run 2 — the integrity cross-check and the input cap:
```
[h] logged/actual mismatch => isError=true | Error: Auto review of tool "probe_write" failed; its body was not executed: auto-review: the pending call disagrees with its logged action
[i] no logged record => isError=true | Error: Auto review of tool "probe_write" failed; its body was not executed: auto-review: the pending native call is missing or ambiguous in the session log
[j] maxInputBytes=900 exceeded => isError=true | Error: Auto review of tool "probe_write" failed; its body was not executed: auto-review: review input is 1387 bytes, exceeding maxInputBytes 900
reviews issued for h/i/j = 0 (expected 0: all three deny before any review)
permissionPresets.names after dispose = ["workspace-write","danger-full-access"]
[k] after auto-review disposal => isError=false | EXECUTED probe_write src/k.txt
```
Zero review requests for h/i/j — each denies before the model is asked. (k) is the honest read of unloading: cordis removes the listener before the disposer's abort, so after a hot unload calls execute unreviewed while the session's `permission/preset: auto` event still stands. The withdrawn-deny path is defensive, covering a review in flight when the lifecycle aborts. Documented in the README; a deployment that needs a non-removable gate must compose it rather than let it be unmounted.

Run 3 — `never` is final and never escalates, plus the real framed prompt:
```
[a2] medium/deny under never => isError=true | Error: Auto review rejected tool "probe_write"; its body was not executed: no explicit production authorization
     approval/asked count under never = 0
     bodies executed = []
framing bytes = 1614
snapshot route = {"provider":"probe","model":"probe-1","cwd":"C:/dev/freddie"}
snapshot projectInstructions roles = ["constraint"]
snapshot history roles = [["user-message","human-instruction"],["checkpoint","checkpoint"],["tool-call","fact"],["tool-call","fact"],["tool-call","fact"]]
snapshot action = {"mode":"native","name":"probe_write","description":"Write one named file inside the workspace.","parameters":{...},"arguments":{"path":"src/a.txt","body":"hello"}}
```
The four data sections a real call produced (`cwd`, one `constraint` project instruction, one `human-instruction`, one `checkpoint`, three prior calls all as `fact`, then the pending action's name/description/schema/arguments) match the framing the port documents.

`node scripts/publint-all.js` reports `All good!` for `packages\interaction\auto-review`, including the script's own publication-closure check. The script's only failure is `packages\client\ui-settings-web-search`, a sibling's in-flight package. `pnpm run publint` cannot complete in this checkout for the same reason it could not before this package: its pre-run `pnpm install` fails on `ERR_PNPM_IGNORED_BUILDS` for `@google/genai@1.52.0`, a build-script-approval blocker unrelated to this work; `pnpm-workspace.yaml` was not edited.

Docs touched: `packages/interaction/README.md` (new row), `packages/README.md` (`interaction/` row), `docs/config-catalog.md` (new `@freddie/freddie-auto-review` entry, hand-maintained since `scripts/gen-config-catalog.ts` no longer exists), and `docs/event-producer-consumer.md` (`auto-review` added as a `prepend` consumer of `tools/pre-execute`).

Deferred: no `src/invariant.js` companion — the fail-closed paths throw into the gate's own denial rather than leaving a silent state an invariant could catch.

What this buys: one place where a model authorizes each tool call on the Auto preset, with the human as the escalation target, and every failure mode on the denying side. What it costs: a model round trip on every call while Auto is selected; reviewer reasoning is unrecoverable after the fact; and the preset is advertised by mutating the shared table, so a composition whose defaults are exactly `danger-full-access` + `ask` would derive `auto` for new sessions until `advertise: false` or an explicit `defaultPreset` is set.

The tree is left dirty and uncommitted.
