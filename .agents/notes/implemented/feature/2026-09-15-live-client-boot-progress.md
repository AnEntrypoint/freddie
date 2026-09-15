# Agent Note: Live client boot progress

Status: implemented

## Problem

The framework-free startup page could remain visible while the client plugin tree loaded without showing enough progress or an accessible explanation of the work in flight. A person could not distinguish graph construction from dependency waiting, and the visible service count alone did not expose the active loader entry.

## Decision

`AppWebEntry` projects existing Loader `internal/status` events into `BootPage`. The boot page presents settled services as a native progress value over entries the Loader has actually reported, names the entry being prepared, shows elapsed startup time, and summarizes graph discovery, active loading, dependency waiting, blocked entries, and handoff to the workspace. The complete roster remains visible as an expected count until each entry reports; unregistered rows never dilute the ready fraction. The page retains the single loader-owned DOM tree and clears when `uiRenderer` mounts.

The progress page remains framework-free and uses only local CSS so it can report startup failures when the dynamic renderer is unavailable. Its status text is announced through polite live regions, and the primary status uses the boot page's primary label token to meet contrast requirements.

## Alternatives considered

**Wait for progressive application rendering.** The client architecture deliberately makes one complete UI handoff after the full roster activates; a startup projection improves observability without changing that loading model.

**Add a separate startup transport or store.** Loader status already names the authoritative lifecycle state. A second channel would create synchronization work and could disagree with the actual client tree.

## Consequences

Startup provides realtime feedback through the same client lifecycle that governs plugin activation, with no additional connection, React tree, or polling work. The page still waits for the full roster before rendering the workspace, and failed entries still use the existing retry and copy-details recovery report.

Live verification: the running GUI at `http://127.0.0.1:3080` accepted the source revision over `/plugins/events`; `window.__FREDDIE_HMR__.status` reported `connected: true` with its sequence advancing from 111 to 121 while the workspace remained mounted.

## Related

The client loading and one-flip application handoff are specified by [the web client architecture note](../architecture/2026-07-19-gui-web-client-architecture.md).
