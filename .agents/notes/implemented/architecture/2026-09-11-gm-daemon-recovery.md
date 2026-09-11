# Agent Note: GM daemon recovery without request replay

Status: implemented

## Problem

A shared GM daemon can stop while a spool request has an unresolved claim. A string-only failure leaves the consumer unable to distinguish daemon loss from an ordinary dispatch failure, while automatic replay could duplicate a request whose execution status is unknowable.

## Decision

`@freddie/freddie-gm-client` throws `GmDaemonUnavailableError` with a stable code, daemon-health classification, bounded project heartbeat facts, machine heartbeat age, dispatch verb, dispatch key, and queue state. [GM response-file completion and dead-daemon replay](../bug-fix/2026-09-11-gm-response-file-completion-and-dead-daemon-replay.md) owns the current recovery behavior after `GM_DAEMON_DIED`.

## Alternatives considered

**Automatically replay every unavailable request.** The spool protocol cannot prove that a hung daemon did not execute the claimed body. Replaying a hung request can duplicate side effects.

**Leave the original string error.** Consumers cannot reliably choose a recovery path or surface useful diagnostics without parsing an unstable sentence.

**Treat every stale project heartbeat as daemon death.** A long claimed dispatch can outlive the project ticker. Queue state and machine heartbeat distinguish a live long-running request from unavailable execution.

## Consequences

Consumers receive machine-routable availability failures. A hung operation remains failed; the dead-daemon replay boundary is defined by the owning bug-fix note.

Live verification constructs the exported typed error, validates its code and bounded facts, and checks the package source with Node syntax validation.
