# Agent Note: GM runtime update projection

Status: implemented

## Problem

The active GM runner and plugin update state was available only in daemon status files. A user could see a GM graph while lacking the runner version, GM plugin version, update handoff state, and updater failure that explain whether the integration is current.

## Decision

`@freddie/freddie-gm-client` exposes `runtimeStatus(cwd?)`, which reads the selected project status and the machine daemon heartbeat and returns only runner version, GM plugin version, update state, and updater error. `@freddie/freddie-tool-gm` captures this leaf JSON at its existing `gm/progress` publication boundary. `@freddie/freddie-gm-progress` projects the whole value at state version 4, and `@freddie/freddie-client-ui-observability` renders it in the Overview metric grid.

The runtime read is optional observability. A failure to inspect status cannot replace or fail a GM tool result. The dock displays an explicit unavailable or not-observed state until the selected session receives a fresh GM progress snapshot.

## Alternatives considered

- **Read daemon files in the browser** — rejected because browser code has no filesystem authority and the daemon path is host-local.
- **Add a client Remote for status** — rejected because the existing durable `gm/progress` projection already carries the session-scoped observation channel.
- **Embed the full daemon status document** — rejected because it leaks implementation detail and live process data outside the small UI need.

## Consequences

- The Overview gives a visible, durable snapshot of the GM runtime that produced each dispatch.
- Existing session history remains readable because an absent `runtime` field projects as not observed.
- The status can be stale between GM tools; the UI names this boundary instead of polling the daemon.

## Verification

`Gm.prototype.runtimeStatus()` against the active daemon returned runner `0.1.158`, GM `0.1.1362`, update state `current`, and no updater error. The changed buildless JavaScript files pass `node --check`. The real GUI loaded the HMR-updated Overview and rendered the explicit not-observed state for a historical session without a new `gm/progress` event.
