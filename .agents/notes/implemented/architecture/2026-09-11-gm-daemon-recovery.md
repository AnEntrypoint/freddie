# Agent Note: GM daemon recovery without request replay

Status: implemented

## Problem

A shared GM daemon can stop while a spool request has an unresolved claim. A string-only failure leaves the consumer unable to distinguish daemon loss from an ordinary dispatch failure, while automatic replay could duplicate a request whose execution status is unknowable.

## Decision

`@freddie/freddie-gm-client` throws `GmDaemonUnavailableError` with a stable code, daemon-health classification, bounded project heartbeat facts, machine heartbeat age, dispatch verb, dispatch key, and queue state. `Gm.call()` performs one readiness recovery attempt after this error and records whether the daemon became available for a later explicit call. It rethrows the original error and never resubmits the unresolved request.

## Alternatives considered

**Automatically replay the request.** The spool protocol cannot prove that the daemon did not execute the claimed body before failing. Replaying can duplicate side effects.

**Leave the original string error.** Consumers cannot reliably choose a recovery path or surface useful diagnostics without parsing an unstable sentence.

**Treat every stale project heartbeat as daemon death.** A long claimed dispatch can outlive the project ticker. Queue state and machine heartbeat distinguish a live long-running request from unavailable execution.

## Consequences

Consumers receive machine-routable availability failures and can make an explicit retry decision after a readiness attempt. A failed operation remains failed; recovery improves only the next caller-owned request.

Live verification constructs the exported typed error, validates its code and bounded facts, and checks the package source with Node syntax validation.
