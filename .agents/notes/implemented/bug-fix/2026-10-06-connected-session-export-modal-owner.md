# Agent Note: Connection-scoped body-mounted dialog owners

Status: implemented

## Problem

The Session export header action is a DOM factory consumed by the renderer. Its initial `setProps` runs before connection, and the diff can discard that detached element while retaining an existing owner. A body-mounted modal created during the detached render survives: an element that never connects does not receive `disconnectedCallback`. Reusing the modal within each owner does not prevent these abandoned owners from allocating portals.

The composer permission selector has the same detached-factory boundary. Its confirmation portal also needs removal when a connected selector is discarded on a session transition. A real session roundtrip leaves four hidden body-mounted confirmation portals without that ownership rule.

## Decision

The Session export header action and composer permission selector render their local controls from preconnection props but create or update their modals only while connected. `connectedCallback` renders the current props; `disconnectedCallback` removes and clears the owned modal. The primitive retains its explicit body-mount behavior, which escapes ancestor stacking contexts.

The [persistent-modal identity decision](2026-09-04-body-mounted-modal-identity.md) remains applicable to connected owners. Connection-scoped portal ownership adds the missing lifecycle rule without replacing that identity rule.

## Alternatives considered

**Make the modal primitive infer its owner.** `renderModal` receives a modal and props, not an owning element. Inferring ownership changes a shared API and cannot identify a discarded factory element reliably.

**Remove portals when closed.** Closed portals can still be recreated by detached owners, and an open modal can leak too. Open state does not establish owner lifetime.

## Consequences

Detached factories allocate no portal. A connected owner retains one dialog across state changes and removes it on disconnect; button rendering, export requests and the [Full-access confirmation flow](../feature/2026-07-31-gui-full-access-confirmation.md) keep their existing behavior. This does not remove portals abandoned by an earlier page lifetime.

## Verification

In the real 54-node conversation, ten production content-only updates create no additional mounted modals. The production header factory creates no modal while detached, creates one after connection, and removes that portal on owner disposal. The real Session log button reaches the download-success dialog; Escape closes it without increasing the modal count.

Five real permission-selector session roundtrips keep the mounted modal count at seven. The actual Full-access chooser disables confirmation until its checkbox is checked; Cancel and Escape close it, and reopening resets acknowledgement. Removing the connected selector removes its open portal (seven modals to six); reconnecting creates a distinct owned portal (six to seven). Switching away with confirmation open closes it, and returning preserves Workspace Write without an open dialog. Verification never executes the enabling action or changes permissions.
