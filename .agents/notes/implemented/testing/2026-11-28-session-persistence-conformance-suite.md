# Agent Note: One conformance suite for any SessionPersistence backend

Status: implemented

## Problem

The sessions cut in [the fx plan](../../../../docs/fx-split.md) replaces freddie's session store with fx's, and the plan asks for a parity witness against the behaviour before the cut. The SessionPersistence contract lived only in prose (`packages/session/session-persistence/README.md`) and in the jsonl backend's behaviour, so there was nothing a second backend could be checked against.

## Decision

`packages/session/session-persistence/src/conformance.js` exports `runConformance({ name, newStorage })`. A backend supplies a harness: how to open a backend over some storage, how to abandon it without a clean shutdown, and, optionally, how to tear the last record and how to crash right after an append. The suite builds the Cordis context and the real `SessionStore` itself, so the backend is exercised through the same `prepare` and `load` path the product uses. The nine cases cover contiguous sequence numbers, durable append (after an abandon, and after SIGKILL of the writing process), interrupted-turn repair, a torn final record, `list`, `listSnapshots` revisions, `readFrom(seq)`, and a fork's header and independence. A case whose hook is missing is reported as skipped. The jsonl backend is the first harness (`packages/session/session-persistence-jsonl/test/conformance.js`, with `test/conformance-child.js` for the crash).

The suite was proved red before it was trusted: breaking one property in the jsonl backend at a time (the seq check, the interrupted-turn closers, the header's parent link, the `readFrom` suffix, the snapshot revision, the torn-tail repair, and an `append` that answers before it writes) made the matching case fail by name each time.

## Found while building it

The first durability case, an abandon followed by a reopen in the same process, could not fail for an `append` that answers early: the late write still lands in the same process before the reopen reads. Only a process that dies right after the append can show it, so that case exists and the harness hook for it is optional. Its child appends several batches, because the first append materializes the file synchronously and would hide the early answer.

## Rejected

- A delete case. The seam has no deletion API (the jsonl README says so); a case would assert something no backend promises. If a backend needs deletion, the contract grows first and the suite follows.
- A fork method on the persistence service. Fork is core logic (`SessionStore.fork` seeds a child and stamps `parentSession` and `seedLength`); what a backend owes is storing those fields, the seed prefix and an independent log, which is what the case checks.
- Running the suite through the Loader with a booted configuration. It is a seam contract check; product-visible plugins are still verified by booting the real configuration.

## Gave up

The suite runs under Node today, through the transitional `@freddie/freddie-runtime-node`. The crash case needs a child process, so a backend whose storage is not on a local disk needs its own `crashAfterAppend`, or reports that case as skipped.
