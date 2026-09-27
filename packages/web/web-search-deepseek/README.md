# freddie-web-search-deepseek

DeepSeek-backed `WebSearchProvider` for `ctx.web`, using the native `web_search_20250305` server tool over DeepSeek's Anthropic-compatible Messages API (`https://api.deepseek.com/anthropic/v1` by default) — a separate endpoint from the conversation adapter's own `DEEPSEEK_BASE_URL`. Each search costs one model turn on that endpoint but returns structured, citeable result blocks; an absent result block is a hard error rather than a prose-scraping fallback, since there is nothing else to parse.

## Surface

Registers into `ctx.web` alongside `@freddie/freddie-web-search-exa`/`-browser`; the seam picks a provider by its own selection policy, not this package. Config: `apiKeyEnv` (a credential reference, default `DEEPSEEK_API_KEY` — the harness's existing conversation key, reused here) or a literal `apiKey`; `baseURL` (default the endpoint above, overridable by `$DEEPSEEK_SEARCH_BASE_URL` independently of chat); `model` (default `deepseek-v4-flash`); `maxTokens`/`maxUses` bounding the underlying Messages call and how many searches it may run server-side.

Every dispatched request is recorded — secret-free — as a `web/deepseek-search-llm-request` session event immediately before the network call, so a transcript shows exactly what was sent for an auxiliary search the same way it shows the conversation's own requests.

## Model Experience

The seam's own `search` tool surfaces `sources[]` (`url`, optional `title`/`snippet`/`publishedAt`); this provider fills that shape by joining Anthropic `web_search_result` items to their citation excerpt (the snippet lives in a separate `text` block's `citations[]`, keyed by URL — Anthropic's result items themselves carry no inline snippet).

#### KV Cache effect

None beyond the ordinary search-tool result; the request this provider makes is a separate, auxiliary model call, not part of the conversation's own cached request.

## Known Limitations and Deferred Work

- **Config is resolved once at plugin load, not re-read live.** Unlike the seam this was ported from (which snapshots a live, hot-reloadable settings section per search), this matches `@freddie/freddie-web-search-exa`'s own existing precedent — freddie has no established `.volatile()`-style live-settings mechanism for a search provider today. A config change takes effect on the next composition reload.
- **Credential resolution still re-runs per search** (via `ctx.get('credentials')`, matching `@freddie/freddie-llm-deepseek`'s own pattern), so a credential rotated through the credentials service reaches the next search without a restart even though the endpoint/model/limits do not.
- **Redirects fail closed** (`redirect: 'error'`) rather than following them, matching the seam's other providers' trust posture for a credentialed request.
