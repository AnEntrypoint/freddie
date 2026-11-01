# 03-eliminate: gm-stale-mcp-bundle-restart

session: mcp-codemode-3535970-1793542718115-1-6

## U1: local gm-mcp source checkout, and a bundle-version check at tool-call startup
expected (row contract): an edit target that makes the server detect a newer installed bundle exists within reach.
observed:
- /workspace/gm/gm-mcp is a git checkout of gm-mcp (fs_readdir 1793543436103-726-5dfc8511cef264f1 and codesearch). HEAD 94ec2e5 ("Bump bundle to 0.2.381 with skill snapshot"), 1 ahead / 1 behind upstream f664ce157be4 (stale_tree in codesearch 1793543442943-743-b4e17b5788a72ea7). Reconcile needed before any edit.
- /workspace/gm/gm-mcp/src/bundle-drift.js exists (Read). It implements the drift check: `bundleDrift()` compares running and installed sha; `bundleStalenessLine()` emits `gm-mcp: this server is serving bundle ... -- restart required ... relaunch from <installed path>`; the watch runs a first check after 5 s and then every 30 s.
- git_log of /workspace/gm/gm-mcp (1793543455122-3660-f85d65eed5192205): `9ea17cf` 2026-11-01T15:27:17+02:00 "Stop stdio sessions handing over to new bundle".
verdict: KNOWN. The detection and the "restart required" line already exist in the gm-mcp source. The edit target is a separate repo (AnEntrypoint/gm-mcp), not /workspace/freddie, and it is not the file the row names.

## U2: bundle version the live server reports, and whether it matches the installed bundle
expected (row contract): the served version is observable and equals the installed one, or the mismatch is named.
observed:
- Installed bundle /config/.gm-tools/gm-mcp-server.mjs (canonical /data/cache/gm/.gm-tools/gm-mcp-server.mjs, 2304623 bytes, mtime 2026-11-01T13:28:20.546Z): `BUNDLE_VERSION = "0.2.380"`, serverInfo gm-mcp 0.2.380 (fs_read 1793543350989-543-1c632676cf1c56a7).
- gm_codemode health (1793543339315-500-350b8a8b21607f81) reports crate_version 0.1.2143 and no gm-mcp bundle version.
- fetched.json (1793543278620-362-7f4adf576ad436b4): sha 084e8858…, commit_sha 9ea17cf…, outcome not_modified. The server's self-update-check (log) reports `outcome: current`, `hash: 084e8858…` at 14:03:53Z.
- Live gm-mcp processes (proc_list 1793543367013-564-b6cf981597ee692f): 3214494, 3215056, 3216866 are `node -e … import(bundlePath)` loaders; 3215584 is `node /config/.gm-tools/gm-mcp-server.mjs`. None reports its loaded version.
- Current server log (/config/.gm-tools/gm-mcp-server.log, 151 lines, 14:03:40–14:03:58Z) has no `bundle-drift-detected` event.
verdict: PARTIAL. The installed version and its hash are known and match the remote `current` outcome. The served version of each live process is not observable from any verb.

## U3: does a running server re-read its bundle after an install, or keep the startup image
expected (row contract): a stale server is named (restart required) rather than silently serving old code.
observed:
- Live start times are not observable: /proc is refused by the sandbox (fs_read 1793543390535-626-876cdcd082740c91), proc_list carries no start time, and the server log has no startup event. The rotated log (/config/.gm-tools/gm-mcp-server.log.1, 13:14:30–13:14:54Z) shows none of the current pids. The bundle was written at 13:28:20Z; whether each live pid started before or after that is not known.
- Testing the mechanism needs restarting a live gm-mcp server with a modified bundle. That kills or relaunches a process owned by another lane, which this lane may not do.
verdict: UNRESOLVED by live probe here. Recorded reason: no start-time observation and no permitted restart. The source comment (bundle-drift.js:104–105: a running server keeps its launched bundle) is a claim about the code, not an observation, and is not counted as a probe.

## U4: whether the gm_codemode reply header exposes the server bundle version
expected (row contract): a per-call check can compare versions from the reply.
observed: reply headers on every dispatch above carry only dispatch_id, gm_session_header_version, ok, verb, and timing fields. No bundle version field.
verdict: KNOWN. Not exposed. Any per-call "restart required" report needs a new field or a text line in the server, which lives in the gm-mcp repo.

## summary
- KNOWN: U1 (edit target is /workspace/gm/gm-mcp, outside /workspace/freddie and outside the row's named file; detection already in source), U4 (version not in reply header).
- PARTIAL: U2 (installed 0.2.380 observed, live served version not observable).
- UNRESOLVED: U3 (live probe needs a process restart this lane may not perform).
- No row-named file exists in /workspace/freddie. The row's named file (the installed bundle) is a fetched build artifact whose next fetch overwrites any edit.

## successor
gm-edit cannot run: U3 is open and no edit target is in the row's named file set. File a blocker (gm-stale-mcp-bundle-restart-blocker-mcp-codemode-3535970-1793542718115-1-6) citing the dispatch ids above, and name /workspace/gm/gm-mcp/src/bundle-drift.js as the re-scope target after the upstream reconcile.
