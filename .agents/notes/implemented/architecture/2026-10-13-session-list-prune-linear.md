# Agent Note: session list snapshot prunes its entry cache in linear time

Status: implemented

## Problem

`SessionManager.buildListSnapshot` dropped stale entries from `entryCache` with `items.some(...)` per cached key, which is O(n²) in the session count. Measured in Node against the real manager (`buildListSnapshot` called directly, median of runs):

- N=500: 1.7 ms per rebuild before the change at this size
- N=3000: 52 ms per rebuild; ten separate-task marks cost 302 ms

## Decision

Build one `Set` of live session ids per rebuild and test membership against it. The removed keys are identical; only the lookup changes.

## Verification

- Node, real `SessionManager`, N=3000: direct rebuild 52 ms to 1.7 ms (median); ten separate-task marks 302 ms to 13.3 ms
- live web profile (headless Chrome): after the change the drag benchmark runs with no console errors, and a "New session" click, which rebuilds the list, still changes the conversation as before
