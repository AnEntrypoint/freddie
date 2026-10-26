# Agent Note: One shared day-boundary clock for message chrome

Status: implemented

## Problem

Every `FreddieMessageIconActions` instance armed its own midnight `setTimeout` through `createCalendarDay`: once in the class field initializer (`MessageIconActions.js:21`) and again in `connectedCallback` (`MessageIconActions.js:32`). A conversation of N messages therefore held N timers for one shared day boundary, and each timer re-armed itself at every midnight. Measured at HEAD: 200 instances held 200 day timers after construction and after connection, and 0 after disconnection (dispatch 1792995623946-1070-255d64172f3c1177).

## Decision

`use-calendar-day.js` holds one module-level clock: a `Set` of subscribers, one timer, and one shared `day`.

- The first subscriber arms the timer. If no timer is armed, `createCalendarDay` refreshes `day` from `Date.now()` first.
- `arm` sets `day`, re-arms the timer, then calls every subscriber with the day. The day is set before any subscriber runs, so `MessageIconActions` reads the new day from its handle (`MessageIconActions.js:67`).
- `createCalendarDay(onChange)` subscribes a per-handle wrapper and returns `{ day, stop }` as before. `stop()` unsubscribes the handle and clears the shared timer when the last subscriber leaves.

`MessageIconActions.js` is unchanged. Its constructor-time handle joins the shared set, and `connectedCallback` replaces it with a new handle, so a connected instance holds one subscription and the shared timer stays at one.

Re-arming happens before notification. A listener that throws therefore cannot stop the clock for the next midnight. The listeners after it in the same tick are skipped, and the error propagates.

## Alternatives considered

**Keep one timer per instance and arm it only on connect.** Rejected: connected instances would still hold N timers, which is the defect. It removes only the timers of constructed but unconnected instances.

**Remove the constructor-time handle and create it in `connectedCallback`.** Rejected for this change: `#render` reads `this.#day.day` and runs from `setProps` before connection, so the instance would need a null guard on every render. The shared set already makes the constructor-time handle cost one set entry and no timer.

**Reuse the notifier in `packages/client/runtime/src/client/sessions/notifier.js`.** Rejected: it lives in another package, and `ui-conversation` would take a new dependency on the runtime for a clock that has no session state.

**Publish the day through a chat store or an inject hook.** Rejected: the day tick is presentation-only local state with no cross-entry consumer, so a store adds a shared contract for no second reader.

## Consequences

- Connected instances share one timer. Measured: 200 connected instances hold 1 day timer, and 0 after all are disconnected (dispatch 1792995891554-1412-22f46ce2293afa31).
- A constructed instance that is never connected keeps one set entry until `stop()`. Before, it kept a self-re-arming timer until the process ended. The set entry holds no timer.
- A throwing listener now stops notification of the listeners after it for that midnight tick. Before, each instance's timer was independent, so one failing instance could not affect another.
- Verification ran against stubs: no DOM package is installed, so `connectedCallback` throws `document is not defined` after arming the timer, and the render-level clock text is not witnessed here.
