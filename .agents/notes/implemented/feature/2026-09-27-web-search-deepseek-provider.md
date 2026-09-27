# Agent Note: DeepSeek-native web search provider

Status: implemented

## Problem

`packages/web/README.md` already listed `web-search-deepseek/` (and `web-search-perplexity/`) with a working link before either package existed — freddie has `web-search-exa` and `web-search-browser`, but no provider using DeepSeek's own API, despite the harness already depending on `DEEPSEEK_API_KEY` for the primary conversation adapter. `deepseek-ai/deepseek-harness`'s `web/web-search-deepseek` calls DeepSeek's Anthropic-compatible Messages API with the native `web_search_20250305` server tool — a separate endpoint from chat, returning structured, citeable result blocks rather than scraped prose.

## Decision

New package `packages/web/web-search-deepseek` (`@freddie/freddie-web-search-deepseek`), ported closely: `provider.js` (`DeepSeekSearchProvider`, a `WebSearchProvider` making its own direct `fetch()` call, joining Anthropic `web_search_result` items to their citation excerpts by URL, deduping across `max_uses > 1` results, and mapping failures onto `WebError` codes with endpoint-recovery guidance) and `index.js` (the registering plugin, reusing `DEEPSEEK_API_KEY` by default with its own independent `$DEEPSEEK_SEARCH_BASE_URL` override).

One adaptation: the upstream plugin snapshots a live, hot-reloadable settings section per search (via a schemastery `.volatile()` config type freddie does not have). This port instead matches `@freddie/freddie-web-search-exa`'s own existing precedent — resolving config once at `apply()` — while still keeping per-search credential resolution through `ctx.get('credentials')` (matching `@freddie/freddie-llm-deepseek`'s own established pattern for the exact same key), so a rotated credential reaches the next search without a restart even though endpoint/model/limits do not.

Every dispatched request is recorded as `web/deepseek-search-llm-request` — already present in `packages/core/session/src/known-event-types.js`'s `KNOWN_SESSION_EVENT_TYPES`, so no `ignorable: true` marker was needed (matching the same already-registered situation found for `hook/invoked`/`hook/result`, unlike the two features earlier this session that needed the marker).

## Alternatives considered

**Port the live-settings-reload (`.volatile()`-equivalent) sophistication to match upstream exactly.** Rejected: freddie has no established mechanism for this in a search provider today; `web-search-exa` is the direct, existing precedent for this exact package family, and matching it keeps this change proportionate to a "new provider," not "new config-reload infrastructure for provider plugins in general."

## Consequences

Verified live: the pure response-mapping logic (`citationSnippets`/`mapAnthropicResponse` — citation-to-result joining, cross-block URL dedup, and the `WEB_PROVIDER_ERROR` thrown when no result block is present); the full provider against a mocked global `fetch` (correct endpoint, both `x-api-key`/`Authorization: Bearer` headers sent, the request recorded before dispatch, a missing-credential `WEB_PROVIDER_CREDENTIAL_MISSING`, and an HTTP error response mapped to `WEB_PROVIDER_ERROR` with the parsed detail included); and the full `apply()` plugin wiring against a stubbed `ctx` — provider registration, credential resolution through `ctx.get('credentials')`, and the session event recorded through `ctx.get('agents').currentInitiator()`. `pnpm run publint` passes (233/233). A CLI headless boot regression-checked cleanly (this provider is not wired into any shipped profile).

`web-search-perplexity` — the other package `packages/web/README.md` already documented but did not yet ship at the time of this change — is implemented in [its own Agent Note](2026-09-27-web-search-perplexity-provider.md).
