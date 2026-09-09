# Agent Note: Buildless CSS is served no-cache

Status: implemented

## Problem

Chrome DevTools flagged static CSS with TTL=0. css-manifest previously sent only `content-type` and no `Cache-Control`. There is no hashed production CSS pipeline in this workspace: `apps/web` is a buildless shell and `/styles/` serves source files by stable id.

## Decision

`serveStyles` sets `cache-control: no-cache`. That matches client-hmr's documented contract (the host serves bundles no-cache). A hashed immutable strategy would require a separate production artifact pipeline that does not exist here.

## Alternatives considered

**Long-lived Cache-Control on `/styles/`.** Rejected: HMR and source-served CSS would then show stale sheets after a save.

**A hashed production CSS pipeline.** Out of scope for this walk; would be a new build step.

## Consequences

Dev and this GUI both send no-cache. Measured LCP savings from caching CSS were ~50ms; correctness of HMR outweighs that.
