# Agent Note: Conversation controller publication and input-shell lifetimes

Status: implemented

## Problem

A selected session can render synchronously when the conversation client plugin reloads. Publishing its input provider and slot consumers before its controller is ready makes `conversation.session` and `conversation.composer.bar` fail injection and abdicate their entries. Delayed history hydration during fresh boot masks the ordering defect.

An input shell also outlives the plugin that creates it when cleanup belongs only to the retained session scope. Its queue subscription retains the old shell and publishes input state after replacement. A clean live session grows from two raw listeners to four over two conversation reloads.

## Decision

Client `apply` awaits the actual Cordis `ConversationController` plugin fiber before publishing input or slot consumers. Fiber readiness propagates initialization failures; consumers retain their fail-loud checks. This is a direct dependency on the same plugin's controller, not the unrelated-service ordering barrier rejected by [slot declaration injection](../architecture/2026-08-05-slot-declaration-injection.md).

`InputHub` nests the session's shell effect inside the creating plugin's effect. Either lifetime removes the opposite owner's effect wrapper. `SessionInputShell.dispose` releases its queue subscription before releasing the machine; existing abort and stale-result handling remains unchanged. The [input architecture](../architecture/2026-07-25-web-input-machine-and-slash-pipeline.md) retains its session routing and optional trigger dependencies.

## Alternatives considered

**Delay rendering or weaken injection failures.** Neither identifies controller readiness; swallowed failures leave empty elected slots and conceal broken composition.

**Keep session-only cleanup.** Session scopes survive client-plugin replacement, retaining old shells and subscribers.

**Keep a package wrapper after session disposal.** It stops notifications but retains the disposed shell through the returned session-effect closure. Symmetric owner removal releases that closure.

## Consequences

Controller readiness becomes part of activation. Replacing the plugin recreates input shells rather than retaining an old implementation; session selection alone retains each live shell.

Session-first disposal is exercised with transient real Cordis fibers, the production hub, and the selected session. Its added raw listener returns from three to two; the plugin owner effect and shell map empty while the ordinary live hub remains unchanged.

Real Chrome verification uses the existing 54-node session. Healthy conversation replacement and revert preserve the document, visible chat, and error-free slot entries. Both transitions hold two raw listeners; each old shell is disposed, its queue subscription cleared, and its hub and owner-effect lists empty. Nested notification, mutable reads, provider replacement, complete error fan-out, active unsubscribe, and genuine session switching also pass. Ten reversible content updates before and after the checks each produce one ChatView redraw and 111 outlet updates. This records callback counts, not isolated timing gains.
