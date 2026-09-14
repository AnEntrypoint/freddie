# Agent Note: Native-watch HMR and primary realtime operations

Status: implemented

## Problem

The web client needs fast feedback while source changes and agent work arrive concurrently. Repeated full-tree scans consume host I/O while idle, a disposed connection can remain asleep in retry backoff, and the main conversation flow can hide its already-available operational facts behind a separate Overview view.

## Decision

The HMR host uses a native filesystem watcher to mark each served dynamic, shell, or static root dirty and coalesces its next scan. The existing `pollIntervalMs` remains a fallback only when a root cannot open a native watcher. A connection controller retains its reconnect-delay abort controller, so `stop()` cancels both streams and the delay. The observability plugin contributes a compact status element to `conversation.session.header.utilities`; it derives attention, connection, plan, and direct-subagent facts through framework-bound hooks and does not introduce a second subscription mechanism.

## Alternatives considered

**Keep full-tree polling for every root.** It makes network mounts simple but performs work while no source file changed; the fallback preserves that compatibility without imposing the idle cost where native notifications work.

**Make the conversation feature own an operations summary.** Observability already owns the operational projection and can contribute through the declared header utility slot, preserving the product boundary.

**Let reconnect backoff finish after disposal.** A late reconnect can recreate transport activity after its owner has stopped, so its controller belongs to the connection lifecycle.

## Consequences

Normal source edits remain buildless and immediately hot-reloadable, while idle HMR avoids recursive scans on hosts with native watcher support. Network or otherwise unsupported roots retain the prior polling behavior. The primary session header reports actionable realtime state without replacing the detailed Overview workspace. The strip is intentionally summary-only; its detail view remains the observability workspace.

## Verification

The running web GUI exposes a healthy HMR EventSource with sequence continuity through `window.__FREDDIE_HMR__`. A refreshed selected-session header renders the operations strip from live client state. Connection disposal is verified with a controlled backoff whose abort resolves the loop without another generation. Chrome live measurement reported 780 ms FCP, 2.824 s LCP, and zero CLS on the selected-session run.
