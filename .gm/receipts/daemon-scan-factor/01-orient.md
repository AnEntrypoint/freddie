# 01-orient: daemon-scan-factor
session: mcp-codemode-3535970-1793542718115-1-13

## row
title: Cut the 128-root spool scan that makes git_status 4.8x slower
acceptance (given, prd row): Live before/after on the same daemon registry: five isolated spool git_status calls versus five direct git status --porcelain calls, plus one dispatch written during an idle wait that still completes.
route_family: execution. resolution note: route to daemon scan path, not freddie surface.
files named by row: none.

## codeinsight
callers git_status: store_busy (.gm/gm.db.lock held, owner_pid 3210559 alive); index_current false; 0 edges. Not current evidence.
impact git_status: index incomplete, 256 files deferred; not current evidence.

## codesearch dual (SPOOL_WORK_CACHE_TTL active_projects spool scan root registry)
bm25: skipped (route_without_index). vector hits: packages/client/modules, packages/client/hmr, packages/client/runtime slots, attachment cachePath. None are the gm daemon.
commits channel: 7 hits, all client/session perf or docs commits. None touch the spool.

## codesearch literal (freddie tree, 4812 files, exhaustive:false)
SPOOL_WORK_CACHE_TTL: 2 matches, both in row text (.gm/prd.yml:200, .gm/prd/daemon-scan-factor.yml:3). No constant defined in tree.
active_projects: 6 matches, all in notes/memories/mutables/row text. No code.
claimed_running: 18 matches, all in row/prd text. No code.

## codesearch literal (root=/config, output=located)
SPOOL_WORK_CACHE_TTL: 0 matches, scan INCOMPLETE (file cap 50000 hit, listing_incomplete). Zero is not a finding.
Located gm-mcp source copies (candidates, not verified as the live daemon): /config/tmp/fetch-fix/gm-mcp/src/skills-snapshot.js, /config/tmp/gm-mcp-port/src/skills-snapshot.js (both minified, skipped by search).

## facts the row relies on
F1 daemon active_projects=128 and SPOOL_WORK_CACHE_TTL=200ms live in gm daemon runtime, not in /workspace/freddie source.
F2 the freddie tree contains no spool scan code; the row resolution itself says route to daemon scan path.
F3 measured numbers (1299ms vs 272ms; attribution 63.9% claimed_running) are recorded in row text only; re-measure at ELIMINATE.
F4 this lane was starved once on the store serial lane (dispatch_starved_waiting_for_serial_lane, 10 waiters) and re-dispatched with byte-identical body; the row's own symptom is live in this session.

## status
no file in /workspace/freddie is named or located for this row. Next: gm-unknowns.