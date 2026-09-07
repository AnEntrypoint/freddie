# Agent Note: Read-only extra FREDDIE_HOME session listing

Status: implemented

## Problem

Each JSONL session store takes an exclusive `.writer.lock`. A second Freddie process therefore cannot share `~/.freddie/sessions`. Headless runs under a different `FREDDIE_HOME` never appeared in the Web UI sidebar, even though the user asked to see every run on the machine.

## Decision

`JsonlSessionPersistence` gains `extraRoots` and `listForeign(root)`, which scans another sessions directory's header frames without claiming its writer lock. `listVisibleSessionSummaries` merges those headers as `readOnly: true` rows. The sidebar shows them with a read-only label, refuses open/rename/fork/archive/drag, and never attaches them as a writable session.

The base bundle fills `extraRoots` from `FREDDIE_EXTRA_SESSION_ROOTS` (`;` on Windows, `:` elsewhere).

## Alternatives considered

**Point two processes at one sessions root.** Rejected: two writers interleave appends and corrupt seq.

**A machine-wide home registry file written on boot.** Deferred: an env list is enough to prove the read-only merge without a new discovery daemon.

## Consequences

A foreign session is visible, not selectable. Opening it would still need a read-only history path that this walk does not add. Missing extra roots are skipped with a warning rather than failing the whole list.
