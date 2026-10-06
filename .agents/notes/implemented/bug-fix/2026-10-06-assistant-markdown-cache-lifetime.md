# Agent Note: Assistant Markdown cache lifetime

Status: implemented

## Problem

The module-level `AssistantMarkdown` cache retains every rendered block after its conversation row is removed. Real history navigation leaves four detached Markdown roots with 207 descendants reachable from that cache. Stable block reuse is required: the assembler rebuilds node objects during streaming, while Markdown parsing, reasoning expansion and code-copy feedback belong to retained elements.

## Decision

`AssistantMarkdown` returns a native element keyed by the stable `node.key`. That element owns its block-index cache and renders its private subtree with `applyDiff`. Parent VNodes omit children and use the tag returned by `defineElement`, preserving private rendering and versioned custom-element registration. No module-level strong reference holds block elements.

The cache survives transient disconnects, moves and updates of the retained owner. Removing the owner makes its cache and children collectible together. Remounting a disposed row creates fresh local expansion and rendering state. The [realtime feed cache decision](2026-10-02-realtime-feed-element-cache.md) retains the stable-identity and detached-child diff constraints.

## Alternatives considered

**Key a `WeakMap` by assembler nodes.** Those objects change on each chunk, losing parser and disclosure state despite a stable logical row.

**Prune a module-level cache on disconnect.** Disconnect also occurs during DOM moves; clearing there loses state, and eviction cannot distinguish independent rendered owners of the same logical key.

**Recreate blocks on every render.** This discards incremental parsing, expansion and copy feedback while a live row is unchanged.

## Consequences

Cache retention follows native row ownership rather than all histories visited in a page. Block dispatch, streamed versus settled Markdown parsing, mention identities, image grouping and interrupted notices keep their existing inputs and render helpers.

## Verification

On the running web profile, navigation across four existing histories and back left four removed owners and their Markdown children unreachable through weak references after Chrome garbage collection; the current owner remained connected. A real session notification retained owner and block identity. Transient removal/reinsertion and streaming prefix, append and settlement updates of the existing message reused its Markdown element and restored the original text. Probes and temporary render inputs were removed. The visited rows contained no reasoning disclosure, so its expansion behavior was checked through unchanged helper inputs and retained child ownership, not a live disclosure interaction.
