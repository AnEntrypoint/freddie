# Agent Note: Perplexity web search provider

Status: implemented

## Problem

`packages/web/README.md` listed `web-search-perplexity/` alongside `web-search-deepseek/` before either existed; [the DeepSeek provider's Agent Note](2026-09-27-web-search-deepseek-provider.md) closed the first gap and flagged this one as the remaining sibling.

## Decision

New package `packages/web/web-search-perplexity` (`@freddie/freddie-web-search-perplexity`), ported verbatim — this one needed no adaptation at all. It matches `@freddie/freddie-web-search-exa`'s existing shape exactly: a plain constructor-captured options object (no live-settings thunk, no credentials-service integration), config resolved once at `apply()`, `apiKey` falling back to `$PERPLEXITY_API_KEY` via `launchEnvironmentOf`. Perplexity's OpenAI-compatible chat-completions response prefers structured `search_results[]` (url/title/snippet/date) and falls back to URL-only `citations[]`; unlike Exa or DeepSeek, Perplexity's own generated answer is preserved as the result's `content`.

## Alternatives considered

None distinct from [the DeepSeek provider's note](2026-09-27-web-search-deepseek-provider.md) — this package is smaller and architecturally simpler than that one, needing none of its adaptations.

## Consequences

Verified live: `mapPerplexityResponse`'s structured-vs-fallback preference (structured `search_results` used when present, ignoring `citations` even when both are supplied; URL-only `citations` used only in their absence, with no content when `choices` is absent); the full provider against a mocked `fetch` (correct endpoint, bearer auth, `search_recency_filter` passed through, unavailable with no key, HTTP error mapped to `WEB_PROVIDER_ERROR` with the parsed detail); and the plugin wiring registering under the correct provider id with the `$PERPLEXITY_API_KEY` environment fallback. `pnpm run publint` passes (234/234). A CLI headless boot regression-checked cleanly (this provider is not wired into any shipped profile).

`packages/web/README.md`'s documented package list and its shipped code now agree completely for this group.
