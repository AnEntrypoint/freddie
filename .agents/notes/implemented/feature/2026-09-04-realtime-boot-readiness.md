# Agent Note: Realtime boot readiness

Status: implemented

## Problem

The framework-free boot page exposed only aggregate service activation, so a user could not distinguish active loading, blocked dependencies, and startup failures before the dynamic UI became available.

## Decision

`packages/client/web/src/boot-page.js` derives a labeled readiness summary from the Loader state map. It presents ready, loading, waiting, and issue counts beside native progress, keeps failure diagnostics and recovery controls intact, and coalesces Loader state bursts into one animation-frame DOM render. The fallback page contains its own main landmark, level-one heading, labeled progress, and readiness region.

## Alternatives considered

**A new React status feature** loses visibility precisely when UI plugin activation fails, so the resilient boot kernel owns this presentation.

**Polling a host health endpoint** duplicates Loader facts and introduces avoidable realtime work; Loader status remains the authority.

## Consequences

Startup state remains useful and accessible through client bootstrap failures, while the dynamic `ui-observability` strip labels its existing reactive facts as "Working now." Live verification covers the local client HMR path and browser accessibility audit.
