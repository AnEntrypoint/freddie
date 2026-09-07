# Agent Note: Native gm tools present, abort, and per-process session id

Status: implemented

## Problem

The eight `gm_*` tools registered without `presentCall`/`presentResult`, so Web UI fell through to GenericToolCard raw JSON. `execute(args)` ignored `exec.signal` and declared no `timeoutMs`, so a cancelled turn waited the full 120s spool poll. The base bundle hardcoded `sessionId: freddie-harness-1`, so two concurrent Freddie processes against one project raced a single gm session. Both gm packages (and css-manifest/vendor-modules) lacked `./invariant` companions.

## Decision

`packages/gm/tool-gm/src/presentation.js` owns pure presenters. `gm_codesearch` projects search-card meta from `bm25_hits.symbol.path`/`line_start`, `vector_hits.path`, or filename `hits.path`. `gm_recall` summarizes hit keys (recall has no file:line). `gm_instruction` and `gm_transition` show a compact title from `phase` / `prd_pending_count` when present. Each `execute` forwards `exec.signal` and declares `timeoutMs: 120000`. `dispatch()` throws on abort or daemon death instead of waiting the remaining timeout.

The base bundle derives `sessionId` as `process.env.FREDDIE_SESSION_ID || ('freddie-' + process.pid + '-' + Date.now())`. Empty invariant companions register the exact npm name with a package-specific `No runtime invariant:` reason. `freddie-base` now depends on the two gm packages it inserts.

## Alternatives considered

**Keep the hardcoded `freddie-harness-1` so this walk's `.gm/prd.yml` stays reachable.** Rejected: two concurrent processes racing one gm session is the defect; a walk that needs a named session sets `FREDDIE_SESSION_ID`.

**A dedicated `card: 'gm'` result arm.** Rejected: codesearch is file:line search, recall is a key list, instruction/transition are compact titles — existing `search`/`generic` cards already cover those without a new union arm at every consumer.

**Skip daemon-death checks and only honor AbortSignal.** Rejected: a dead daemon after the in-file is written is the orphaned-dispatch hang; `isDaemonAlive` already exists and a poll that ignores it waits the full timeout.

## Consequences

Presenters are display-only and fall back to the generic card on malformed replayed meta. Changing `sessionId` away from a previous literal partitions `.gm/prd.yml` unless `FREDDIE_SESSION_ID` is set. Abort stops polling; it does not delete the in-file the daemon may still consume.
