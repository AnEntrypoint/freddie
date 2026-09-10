# Agent Note: gm-client boots the native agentplug-runner, not the JS wasm wrapper

Status: implemented

## Problem

`ensureDaemon` imported `~/.gm-tools/bootstrap.js` and called `startSpoolDaemon()`. That spawn starts `plugkit-wasm-wrapper.js` under a JS supervisor. Current `plugkit.wasm` imports `env.host_plugin_call`. The JS wrapper never registers that import, so instantiation fails with `LinkError: import function env:host_plugin_call must be callable`. The wrapper then self-heals by reinstalling the same wasm, fatals, and the supervisor restarts it. Project `.status.json` is never written. `gm_instruction` therefore reports `spawned the gm daemon (pid …) but it never became ready within 45000ms` and names `.gm/exec-spool/.watcher.log`. Live evidence: `C:\dev\freddie\.gm\exec-spool\.watcher.log` is a restart loop of that LinkError; `~/.gm-tools/plugkit-wasm-wrapper.js` `makeHostFunctions` has no `host_plugin_call`; native `agentplug-runner 0.1.121` registers it in `crates/agentplug-host/src/imports.rs`.

## Decision

`ensureDaemon` spawns `~/.gm-tools/agentplug-runner spool` with `CLAUDE_PROJECT_DIR` set to the project root, matching gm-mcp `ensureSpoolRunnerRunning` and gm's skill "Start, never install" path. It still polls `isDaemonAlive` for 45s and still coalesces concurrent boots per cwd. Missing runner binary fails immediately. A timeout names both the project watcher log and `~/.agentplug/daemon.log`.

## Alternatives considered

**Add `host_plugin_call` to the JS wrapper.** Rejected: gm's AGENTS.md names `agentplug-runner` as the sole loader; the JS host is retired. Patching the wrapper would keep a second host that cannot load sibling plugins.

**Keep `bootstrap.js` but skip the JS supervisor.** Incomplete: `startSpoolDaemon()` always starts that wrapper. There is no bootstrap entry that starts the native runner.

**Rely on an already-running machine-wide daemon and never spawn.** Incomplete: a first call against an unregistered project, or after a dead shared pid, still needs `spool` to register the root.

## Consequences

A first `ctx.gm.call` on a machine with `~/.gm-tools/agentplug-runner` starts the native host. The JS wrapper may still exist on disk from older installs; this package no longer starts it. Isolated local runners still use `AGENTPLUG_HOME` as before.
