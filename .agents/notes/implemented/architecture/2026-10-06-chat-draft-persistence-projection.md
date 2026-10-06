# Agent Note: Chat rendering excludes draft persistence

Status: implemented

## Problem

Each composer edit synchronously persists its draft through the chat store. Render subscribers to that same source redraw the session body and transcript even though their selection, view, and inspection state has not changed. A disconnected body can also reinstall its mirror through later props delivery, while binding without a current-value flush leaves edits made without a mirror unpersisted.

## Decision

One registered chat handle retains the existing persisted backing and its four-field format under `dsh.conversation.chat.<sessionId>`. Each framework-owned instance exposes a separate snapshot containing every chat-render field: `selection`, `view`, and `inspect`. An instance-local subscription copies those fields through the existing snapshot store's structural equality operation. Draft-only writes preserve the render snapshot and notify no render subscriber. All render actions delegate to the backing; pruning retains its existing persistence cleanup.

Draft read and write methods remain private instance operations. The session injection resolves the same instance and input shell, hydrates only an empty live draft, persists its canonical clipboard projection, and binds subsequent writes. Only a connected session body owns that mirror. Detached props still render and collect dependencies, but cannot bind; disconnect clears the mirror and binding sentinel, and reconnect flushes the current draft before rebinding.

## Alternatives considered

**Filter direct component subscriptions.** The standard kit's observable store reads also invalidate outlets, so filtering only direct subscriptions leaves the transcript path active.

**Suppress notifications on a draft-bearing public snapshot.** Readers would expose fields whose changes their notification contract cannot report.

**Persist drafts under a second key.** A second key requires migration and changes the lifetime of existing saved drafts without improving the render boundary.

**Cache renders by session-handle identity.** Session handles carry mutable data and callbacks; identity does not establish unchanged render inputs.

## Consequences

Draft persistence remains synchronous under the existing key and format. Render subscribers receive every selection, view, and inspection change without subscribing to draft currency. Frame-scheduled input delivery still reaches the transcript through the parent composer layout.

## Verification and limits

Four genuine character keypresses each produce zero synchronous chat-store notifications, session-body props deliveries, and ChatView props deliveries, versus one, one, and two respectively before isolation. The same keys still persist synchronously. Separate frame-scheduled input delivery remains: each observed key delivers Root once, Session twice, and ChatView three times. These counts prove removal of the synchronous path, not frame rate or overall input latency.

Actual detached-body typing leaves storage unchanged; reconnecting the same body and store immediately persists the live draft. A real document reload hydrates the visible draft, with all 92 fibers active. Genuine view changes notify two simultaneous subscribers, and inspecting an existing tool call updates inspection state and renders Trajectory. Original draft, storage bytes, caret, session, and view are restored; probes are removed. View remounts can change mounted rows and absolute scroll geometry, so restoration evidence distinguishes tail ownership from numeric scroll equality.

The [input machine](2026-07-25-web-input-machine-and-slash-pipeline.md), [session provisioning](2026-07-25-web-client-session-scope-and-provide-channel.md), and [attachment ownership](../feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md) decisions remain active; this projection changes render notification currency, not their data or lifetime contracts.
