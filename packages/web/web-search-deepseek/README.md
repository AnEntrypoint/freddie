# freddie-web-search-deepseek

DeepSeek-backed `WebSearchProvider` for `ctx.web`, using the native `web_search_20250305` server tool over DeepSeek's Anthropic-compatible Messages API (`https://api.deepseek.com/anthropic/v1` by default) — a separate endpoint from the conversation adapter's own `DEEPSEEK_BASE_URL`. Each search costs one model turn on that endpoint but returns structured, citeable result blocks; an absent result block is a hard error rather than a prose-scraping fallback, since there is nothing else to parse.

## Surface

Registers into `ctx.web` alongside `@freddie/freddie-web-search-exa`/`-browser`; the seam picks a provider by its own selection policy, not this package. Config: `apiKeyEnv` (a credential reference, default `DEEPSEEK_API_KEY` — the harness's existing conversation key, reused here) or a literal `apiKey`; `baseURL` (default the endpoint above, overridable by `$DEEPSEEK_SEARCH_BASE_URL` independently of chat); `model` (default `deepseek-v4-flash`); `maxTokens`/`maxUses` bounding the underlying Messages call and how many searches it may run server-side.

Every dispatched request is recorded — secret-free — as a `web/deepseek-search-llm-request` session event immediately before the network call, so a transcript shows exactly what was sent for an auxiliary search the same way it shows the conversation's own requests.

## Settings namespace

This provider serves the `web-search-deepseek` settings namespace: the endpoint, the per-request search budget, and the credential reference the key is resolved under. A commit to that section re-resolves the options the provider serves, so an edit reaches the next search rather than the next composition reload. The key itself is not a section field — it is written through the credentials domain, and the section only names which reference to resolve.

## Model Experience

The seam's own `search` tool surfaces `sources[]` (`url`, optional `title`/`snippet`/`publishedAt`); this provider fills that shape by joining Anthropic `web_search_result` items to their citation excerpt (the snippet lives in a separate `text` block's `citations[]`, keyed by URL — Anthropic's result items themselves carry no inline snippet).

#### KV Cache effect

None beyond the ordinary search-tool result; the request this provider makes is a separate, auxiliary model call, not part of the conversation's own cached request.

## Known Limitations and Deferred Work

- **Only the section's three fields are live.** `model`, `apiVersion`, and `maxTokens` are not in the served namespace, so they still take effect on the next composition reload. Widening the section is a config-surface decision, not a transport one.
- **Credential resolution still re-runs per search** (via `ctx.get('credentials')`, matching `@freddie/freddie-llm-deepseek`'s own pattern), so a credential rotated through the credentials service reaches the next search without a restart even though the endpoint/model/limits do not.
- **Redirects fail closed** (`redirect: 'error'`) rather than following them, matching the seam's other providers' trust posture for a credentialed request.
