# PTC chain — assessed, not ported (2026-09-28)

Upstream `deepseek-ai/deepseek-harness` `master`. Packages assessed:
`ptc-runtime/ptc-runtime`, `ptc-runtime/ptc-runtime-node`, `workflow/workflow-ptc`,
`typert/generator`. Verdict: **none of the four is portable**, for two distinct reasons —
two are already ported under freddie's own names, and one is a build-time TypeScript tool
with no consumer in a buildless tree.

This note exists so a later agent does not re-derive it.

## The rename: `ptcRuntime` is `codeRuntime`

Freddie did not skip the PTC chain; it ported it and renamed it. `packages/code-runtime/`
is the PTC execution capability family under `ctx.codeRuntime`:

| dsh | freddie |
|---|---|
| `ptc-runtime/ptc-runtime` → `ctx.ptcRuntime` | `code-runtime/code-runtime` → `ctx.codeRuntime` |
| `ptc-runtime/ptc-runtime-node` (process) | `code-runtime/code-runtime-worker-thread` (worker-thread) |
| `workflow/workflow-ptc` | `workflow/workflow-worker-thread` |

The Service Definition is the same contract with the same four exported identifier sets —
`PORTABLE_RESERVED_WORDS` (ECMAScript ∪ Python), `RESERVED_BINDING_GLOBALS`,
`RESERVED_ERROR_MEMBERS`, `DUNDER_MEMBER` — and the same `language` / `isolation`
descriptors. Both cite the same capability-seams architecture note and the same decision
date: dsh `2026-06-15-ptc.md`, freddie `2026-06-15-code-mode.md`.

One deliberate divergence: dsh splits `resolve(request)` → `run(spec)` so the provider can
resolve a cwd and a **file sandbox policy**. Freddie's worker-thread backend has no OS file
policy to resolve, so the seam collapsed to a single `run(request)` ("the request carries
everything the runtime acts on, with no hidden defaults") and exposes no `sandboxMode`.

## Why `ptc-runtime-node` is not worth porting

It is a *process* backend whose whole value proposition is OS-level file confinement via
`ctx.sandbox` plus managed process-tree cleanup. On the axes that matter:

- It does **not** platform-reject Windows. Upstream explicitly handles Windows: it retains
  Windows system/temp paths in the OS environment, does ACL setup with the parent's distinct
  `TEMP`/`TMP`, and preserves `ELECTRON_RUN_AS_NODE` for child startup. So the Python
  backend's platform-rejection precedent does **not** generalise here.
- No native binary, and a JS port would need no build step.
- Freddie has every peer seam it needs: `fs/`, `subprocess/`, `sandbox/` (which does have a
  Windows ACL restricted-token runner that fails closed with `SANDBOX_UNAVAILABLE`),
  `sandbox-policy/`, `util/` timeout, `session/`.

So it *could* be ported. It should not be, because the role is already filled and the
existing provider is not a stub — it matches or exceeds it:

| guarantee | dsh `ptc-runtime-node` | freddie `code-runtime-worker-thread` |
|---|---|---|
| credential isolation | `process.env` replaced with empty dict | `env: {}` — measured: program sees **0** env keys |
| budget | elapsed deadline, explicitly "not a CPU meter" | `computeMs` meters **measured busy time** via `eventLoopUtilization()`, plus `maxWallMs` |
| heap cap | `maxOldGenerationSizeMb` 512 | same |
| output cap | 64 MiB | same |
| teardown | managed process range, grace | fails in-flight runs as `abort`, **awaits** worker exit |
| failure kinds | + `protocol`, `sandbox-unavailable` | `exception`/`timeout`/`abort`/`worker-exit`/`invalid-output`/`output-limit` |
| console shim | five methods | same five |

Freddie's stated next step for a stronger boundary is a **container** backend, not a process
one — `isolation` reserves `'process'` and `'container'`, and the worker-thread README's
deferred-work entry names container. Porting a process backend would also re-introduce
`sandbox` into a chain freddie deliberately kept out of it, on a platform where freddie's own
sandbox README reports `enforcement: 'partial'` (the Windows restricted token must retain
Everyone for process initialization).

## Why `typert/generator` is not portable, and has no consumer

- **Build step.** Dependencies are `typescript@^6.0.3` and `@jridgewell/gen-mapping`. It
  reads `tsconfig.host.json` / `tsconfig.client.json`, builds TypeScript compiler programs,
  emits Zod schema factories plus `.d.ts` into `lib/`, and ships a `./tsdown` plugin. Its own
  README: "Generation runs only at build time and never in a live agent session." Freddie has
  no TypeScript sources, no tsconfig, no tsdown, and ships `src/**/*.js`.
- **No consumer.** Freddie *does* consume Typert host artifacts — 15+ packages declare
  `"./typert": "./src/typert.host.js"` and the loader/registry consume them. But those files
  are **hand-owned**. `packages/gm/gm-client/src/typert.host.js` opens with
  `/** Hand-owned Typert host manifest for GM graph-edit Remotes. */` and synthesizes its
  `sourceLocation` as `src/index.js:1:1`; `packages/goal/goal/src/typert.host.js` carries a
  stale `src/index.ts` path inherited from the upstream generator. Nothing needs TypeScript
  analysis or Zod emission. YAGNI.

## Live verification

Executed against the real packages (temp script, not committed):

```
1 seam identity:      codeRuntime=WorkerThreadCodeRuntime language=typescript isolation=worker-thread
2 real execution:     logs ["program printed: 3","a warning"]  value {sum:3,doubled:6}
3 credential isolation: programEnvKeyCount 0, seesHostSecret false (host had 89 keys)
4 budget:             {kind:"timeout",message:"compute budget exhausted (5000ms busy)"} elapsed 5034ms
5 teardown:           {kind:"abort",message:"runtime disposed"} dispose 3ms
6 portable identifier: binding global "lambda" rejected as seam misuse
```

Probe 3 is the security-relevant one: a host secret set in `process.env` before the run was
invisible to model-written code. That is the property the task's security posture requires.

## Follow-ups

- `packages/typert/README.md` and `packages/typert/registry/README.md` advertised a
  `generator/` package that does not exist. Both now state that artifacts are hand-owned and
  no generator is planned.
- `packages/goal/goal/src/typert.host.js` has stale `packages/goal/goal/src/index.ts`
  `sourceLocation` paths from the upstream generator (the package is JS). Cosmetic; not fixed
  here because the file is emitted-shaped and rewriting it is out of scope for an assessment.
