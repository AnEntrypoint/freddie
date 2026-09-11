# Agent Note: GM response-file completion and dead-daemon replay

Status: implemented

## Problem

The standalone `agentplug-runner` publishes a complete spool JSON response without a `.ready` sentinel. `ctx.gm.call()` waited only for that sentinel, then reported a daemon failure despite the result already being available. Its dead-daemon recovery restored the runner but rethrew the failed call.

## Decision

`@freddie/freddie-gm-client` accepts a parseable response JSON whether or not the runner supplies `.ready`. After `GM_DAEMON_DIED`, `Gm.call()` restores readiness and replays the dispatch once. `GM_DAEMON_HUNG` is not replayed because the original operation can still finish.

## Alternatives considered

**Require `.ready` from every runner.** Rejected: the standalone runner already publishes atomic JSON without that extra file, and clients must accept the supported response shape.

**Restore readiness and rethrow.** Rejected: callers still receive a failed tool entry although the client has recovered a dead daemon.

**Replay hung requests.** Rejected: a live hung process can resume and complete the original operation.

## Consequences

Normal standalone responses complete immediately. A confirmed daemon death receives one bounded recovery attempt. A second failure and every hung daemon remain visible to the caller.

Live verification calls `ctx.gm.call('instruction')` against the standalone runner. The call returns a successful instruction response in 312ms from a JSON out-file with no matching `.ready` sentinel.
