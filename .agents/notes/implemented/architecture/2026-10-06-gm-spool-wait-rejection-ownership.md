# Agent Note: GM spool wait rejection ownership

Status: implemented

## Problem

Cancelling a parallel browser search can reject a spool polling wait while `dispatch` awaits response or daemon-health IO. Attaching the rejection handler only at the later wait leaves Node an unhandled rejection interval. The live Freddie host exits through its fatal-load handler with `AbortError`, followed by `PromiseRejectionHandledWarning`, even though the search batch observes every outer call with `Promise.allSettled`.

## Decision

The [GM client](../../../../packages/gm/gm-client/README.md) observes each polling wait's rejection synchronously when creating it, records the outcome, and rethrows its original error at the wait boundary. Every polling iteration releases its watcher, timer and caller abort listener on success or failure. Caller cancellation carries the signal's original reason.

Response checks retain priority over cancellation observed during response or health IO. A result accepted by those checks completes the dispatch; otherwise cancellation rejects it. Cancelling the client wait does not cancel work already claimed by the daemon. The [watch-and-poll latency decision](2026-09-19-gm-step-latency-hot-path.md) remains unchanged.

## Alternatives considered

**Observe only the outer search promises.** Their handlers cannot own an inner polling promise that rejects before its dispatch awaits it.

**Discard polling rejection in a catch.** Suppressing cancellation would lose the caller's reason and permit waiting until timeout.

**Remove the watcher.** Poll-only waiting sacrifices wakeup latency without solving handler timing for any remaining rejectable wait.

## Consequences

Cancellation cannot create an unhandled polling rejection during unrelated IO. Timeout, daemon-health errors and response precedence remain distinct.

Live Node execution with `--unhandled-rejections=strict` verifies a successful real daemon response, seven cancellation timings preserving error identity with zero remaining abort listeners, and a real dispatch timeout. Real `BrowserSearchProvider` batches verify user cancellation and a provider timeout cancelling both siblings with the first error as cause. Both child processes exit successfully without stderr; Freddie responds HTTP 200 afterward. No mock provider or spool is used. Filesystem failure injection and daemon termination are not exercised by these witnesses.
