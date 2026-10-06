# Agent Note: GUI transfer compression and demand-loaded rendering

Status: implemented

## Problem

The live Web GUI served JavaScript, CSS and its index without compression even when Chrome requested Brotli. The connection entry statically imported a 110 kB fixture carrier on ordinary pages. Modulepreload hints included every script in an entry directory, including unused branches. Known conversation nodes also updated a cached fallback element that their elected renderer never read.

## Decision

The shared static responder and generated CSS/index responses negotiate Brotli, gzip or identity, retain encoding-specific validators and body-free HEAD responses, and vary on Accept-Encoding. Encoded bodies are keyed by actual source bytes and bounded by both retained bytes and entry count. File validators derive from the bytes served, rather than size and truncated modification time.

Client module revisions still hash the full served source tree. The preload set follows only static relative imports from each immediately-loaded entry, including sibling imports under src/. The maintained es-module-lexer supplies import records without evaluating modules. Dynamic imports remain demand-loaded; the connection fixture carrier is imported only when its query flag is present.

ChatNodeSeat exposes fallback through a getter. A known elected renderer incurs no fallback element update; an unmatched node retains the same cached disclosure element across rerenders.

## Alternatives considered

Preloading every module row saturates the critical loading chain; the immediately-only policy remains. Filename exclusions would couple the preload service to plugin implementation details. Full payload serialization was not the observed known-node cost: collapsed JsonBlock already defers serialization.

## Consequences

Cold loads transfer fewer bytes while the source remains buildless native ESM. Compression spends CPU on a new representation, then reuses bounded encoded results. Whole-tree revisions still change when a lazy branch changes, preserving HMR and immutable URL behavior.

## Verification

Live HTTP execution against the real Web composition verified decoded byte parity for Brotli, gzip and identity across nine route classes, conditional responses, HEAD metadata, quality exclusions, missing files and binary identity handling. The 408,828-byte stylesheet compressed to 46,645 bytes; 601,155-byte KaTeX JavaScript compressed to 137,223 bytes. These are transfer sizes, not application-start timing claims.

The real browser mounted ordinary and fixture pages. Ordinary pages did not import the fixture carrier. On an actual 40-row conversation, 30 rerenders reduced fallback updates from 1,200 to zero. An unmatched node created one correct fallback and retained its expanded disclosure on a subsequent render. Package publication-shape validation passed after adding the lexer dependency.

The serving and outlet architecture remains recorded in the [realtime serving note](2026-09-14-realtime-serving-and-outlet-subscriptions.md); this note replaces its size-and-mtime validator description, not its lifecycle or read-tracking decisions.
