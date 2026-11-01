# 03-eliminate: daemon-scan-factor
session: mcp-codemode-3535970-1793542718115-1-13

Expected values were written from the row contract (acceptance and resolution text) before each run.

## U1 daemon-source: which source implements the 128-root spool scan and SPOOL_WORK_CACHE_TTL=200ms
expected: the constant and scan live in the gm daemon source, which the row says is not freddie surface.
run: codesearch literal SPOOL_WORK_CACHE_TTL, root /config/tmp/gm-mcp-port -> 1793543210953-263-b81111e4d439831: 0 matches, stale_tree (998 ahead, 1127 behind), JS port only.
run: codesearch literal SPOOL_WORK_CACHE_TTL, root /config/tmp/fetch-fix/gm-mcp -> 1793543211306-264-9088d931b77095d0: 0 matches, stale_tree (4 behind).
run: codesearch literal SPOOL_WORK_CACHE_TTL, root /config/tmp/browser-viewport/agentplug (no_ignore) -> 1793543330198-480-24b484fc51e9552e: 0 lines of 37677 scanned.
run: codesearch literal SPOOL_WORK_CACHE_TTL, root /config/tmp (cap hit, incomplete) -> 1793543282116-366-b4ee424229525e2c: 0 matches, not a finding.
run: codesearch literal holder_running_past_max, root /config/tmp -> 1793543246441-332-ea0e28d14f158272: located the Rust daemon at /config/tmp/browser-viewport/agentplug/crates/agentplug-runner/src/daemon/claim_dispatch.rs (lines 1653, 2848, 3556) and /config/tmp/browser-cdp-timeout/crates/agentplug-runner/src/main.rs:1526. active_projects located at .../src/daemon.rs:4520-4538 (root /config/tmp/browser-viewport/agentplug).
observed: the scan path is in agentplug-runner (Rust), not in /workspace/freddie and not in the JS port. SPOOL_WORK_CACHE_TTL is not in any local checkout searched.
verdict: known (not located as a named constant). Source is outside this repo.

## U2 served-runner: is the running daemon source a local checkout
expected: health source_sha matches a local agentplug checkout.
run: health -> 1793543329816-479-2f0735d45601201f: crate_version 0.1.2143, source_sha 1e5357f0936c305ccb7a56fd6eb5842e8993c900.
run: git cat-file -t 1e5357f0... in /config/tmp/browser-viewport/agentplug (HEAD 3c5ca25) and /config/tmp/browser-cdp-timeout (HEAD ba4adf2): object not found in both.
observed: no local checkout holds the served sha.
verdict: known (mismatch). The served runner cannot be edited or verified from a local checkout.

## U3 baseline: 5 isolated spool git_status vs 5 direct git status --porcelain
expected (row): spool wall materially slower than direct git; row figure 1299ms vs 272ms (4.8x).
run spool git_status wall ms: 327, 368, 345, 348, 372 (mean 352). dispatch ids 1793543297287-392-19f84598840edfc7, 1793543297640-394-e47e6bff68b652a5, 1793543297993-396-5f88a85d47f39089, 1793543298331-398-f42d7c643c3c54f7, 1793543298701-399-c029fc6cd334f27f. In-daemon duration_ms: 80, 81, 80, 80, 99 (mean 84).
run direct git status --porcelain ms (Bash, not via gm): 41, 37, 35, 47, 38 (mean 40).
observed: wall factor 8.9x (row said 4.8x). In-daemon factor 2.1x. About 270ms per call is pickup/poll outside the verb body.
contention: store lane held with 10 waiters at this time (see dispatch_starved). Figure is load-affected and not a clean before; recorded as the live before.
verdict: known (reproduces: spool slower than direct; factor differs from the row figure).

## U4 idle-wait: a dispatch written during an idle wait still completes
expected: dispatch written 1.5s into a 6s sleep completes before the sleep ends.
run: sleep 6s dispatch 1793543315651-438-ff2a3210ab5e2103 (waited_ms 6000, completed true); fs_stat written at 1.5s -> 1793543311085-432-30e8e21e4953955a, returned in 750ms, ok true.
observed: completion holds for a read verb during an idle wait.
not probed: re-execution of a side-effecting verb. Would need a state-mutating write; no test files allowed in this lane. Recorded as a residual, not a pass.
verdict: partly known (completion). Re-execution residual recorded.

## U5 editable-file: does the row name an editable file
expected: the row names a file in /workspace/freddie.
run: Read .gm/prd/daemon-scan-factor.yml (no file key; resolution: route to daemon scan path, not freddie surface).
observed: no file named.
verdict: known. Blocker condition.

## result
Open after elimination: none that a probe can answer. Blocker reason: the row's only edit target is the agentplug-runner daemon at a sha not held locally, and the row names no file. See 03 blocker filing.