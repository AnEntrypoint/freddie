# 03-eliminate: gm-runtime-host-hmr-activation

session: mcp-codemode-3535970-1793542718115-1-8

Each unknown from 02-unknowns.md was probed live. Expected values come from the row contract (pre and acceptance), not from code.

## 1. hmr-live-snapshot
expected (row pre): the active Freddie Web Host holds deferred=true with four GM sources stashed.
probes:
- proc_list (unfiltered): dispatch 1793543325753-465-97631920571b6bb5, 118 processes, first 100 shown, no Freddie host among them.
- exec_js process scan of 122 ps lines: dispatch 1793543376328-595-f0cd3e66733ad9a2. freddieProcessLines=0 for expose-internals, apps/cli, profile-boot, /workspace/freddie, freddie, cordis. Only agentplug-runner daemon pid 3210559 and its guard are present.
- exec_js GET 127.0.0.1:3000: dispatch 1793543391534-632-edc7a47cd6b389d2. The listener is nginx/1.28.3 returning 401 Authorization Required, not a Freddie host.
observed: no live Freddie Web Host process and no reachable host HTTP surface. The HMR snapshot cannot be read.
result: precondition not met in the live system. Status: observed contradicts expected.

## 2. agent-loop-idle-edge
expected: a reloaded journal row follows the deferred row.
probe reason: the journal is in-memory only (framework/hmr/src/index.js:503-508, last 50 rows, no file). It lives in the host process, and there is no host (probe 1). No durable copy exists in .gm.
result: cannot run here. Dispatch ids: probes 1 above.

## 3. host-runs-committed-tool-gm
expected: a fresh GUI GM call publishes runtime JSON with runnerVersion 0.1.158 and gmVersion 0.1.1362.
probes: gm status dispatch 1793543357733-558-f87422530a4e2cbd (daemon heartbeat fresh, no runner or gm version field). gm health reports crate_version 0.1.2143, which is a different field and not comparable to the runtimeStatus leaves.
result: cannot run here. A GUI GM call needs the host (probe 1).

## 4. overview-renders-runtime-metric
expected: Overview shows GM 0.1.1362, runner 0.1.158 and updater state.
probes: exec_js chromium scan dispatch 1793543347033-529-afe8497383faf0e found no browser URL pointing at a Freddie host, only a curl process.
result: cannot run here. There is no Overview to render without the host.

## verdict
Unknowns 2, 3 and 4 depend on the host (probe 1). Each probe reports a concrete reason and dispatch id above. Unknown 1 resolved negative: no live Freddie Web Host.
Restarting or booting a host here would be a fresh boot, which bypasses the HMR path the row witnesses (row invariant: no manual restart or runtime patch bypasses it). The lane must not kill or restart processes.
Edit does not start while unknowns remain open. A blocker is filed: gm-runtime-host-hmr-activation-blocker-mcp-codemode-3535970-1793542718115-1-8.
