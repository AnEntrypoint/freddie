# Agent Note: GM operation outcome summaries

Status: implemented

## Problem

GM can return a failed or refused operation inside a successful tool execution. A raw JSON preview starts with metadata and truncates the useful diagnostic. Historical git-log argument failures and refused pushes consequently resemble ordinary completed calls in Chat and Trajectory.

## Decision

The GM tool provider owns operation interpretation. Its presenter parses its own first JSON text block and reads only the reply's top-level `ok: false`. Gate denial produces `GM refused`; other unsuccessful replies produce `GM failed`. The title includes the first diagnostic line when available. Invalid JSON, absent text and successful replies retain existing presentation. Nested domain values and authoritative tool execution errors do not enter this classifier.

Completed generic Chat rows use the owner's nonempty result title as their wrapping heading,
with the tool name underneath. Trajectory ledger previews consume the same title. Narrow raw
output stacks IN/OUT labels above their data according to the actual row width. Raw content
remains available in expanded output and the inspector, and Trajectory search retains raw
output. The title changes neither `isError` nor timeline error markers. Replay computes the
title from existing durable content, so historical records need no migration or newly logged
presentation fields.

GM git-log and git-show tools declare the daemon's canonical `limit` and `rev` parameters. Request adapters, schemas and package documentation use those same fields. No current consumer requires the rejected legacy parameter names.

The [terminal card decision](../feature/2026-07-28-web-terminal-card.md) retains its independent exit-status interpretation and card rendering. This change only supplies generic owner-authored summaries.

## Alternatives considered

**Infer failure from arbitrary JSON in the generic UI.** The meaning of a result field belongs to the tool provider. A nested `ok: false` can describe domain data inside a successful operation.

**Convert every unsuccessful GM reply into a thrown tool error.** This changes execution semantics and drops the distinction between a completed GM dispatch and the operation it refused. Displaying a diagnostic preserves both facts and the raw reply.

**Rewrite durable text or require new presentation metadata.** Rewriting changes model-visible content; required metadata leaves existing logs without summaries. A pure provider presenter operates on existing durable JSON.

**Keep aliases for rejected request fields.** The current daemon refuses those fields, and exhaustive current-call-site discovery finds only the tool adapter and its documentation. Canonical schemas prevent the model from generating the invalid request.

## Consequences

Live Chrome replay of the real Inspect Current GM Session displays git-log argument diagnostics and push refusals in Chat and Trajectory. A selected Trajectory tool record retains its complete raw Result, including dispatch id, accepted fields and `ok: false`, while its authoritative `isError` remains false and the inspector reports the completed dispatch. Ordinary git-status summaries retain their call-argument fallback.

Direct execution of the provider presenter distinguishes malformed JSON, absent content, successful replies containing nested false values and authoritative tool errors from top-level GM operation failure. The generic title uses the first diagnostic line; multiline detail remains in raw inspection.

Live daemon dispatch with `git_log {limit: 1}` returns one real commit; `git_show {rev: "HEAD", stat: true}` returns that commit. The current host reloads the changed tool provider, but its dynamic probe inventory is empty and authoring probes is model-local. Normal registered-tool invocation is not witnessed through that host; canonical daemon dispatch and current declaration inspection bound the adapter evidence.
