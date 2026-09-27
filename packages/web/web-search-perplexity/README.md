# freddie-web-search-perplexity

Perplexity-backed `WebSearchProvider` for `ctx.web`, over Perplexity's OpenAI-compatible chat-completions endpoint (`https://api.perplexity.ai` by default, model `sonar`). Unlike the Exa and DeepSeek providers, Perplexity returns a generated answer alongside its sources: the response's `content` carries that answer, and `sources[]` prefers the structured `search_results[]` array (url/title/snippet/date), falling back to URL-only `citations[]` only when the response carries no structured results.

## Surface

Registers into `ctx.web` alongside the other search providers. Config: `apiKey` (falls back to `$PERPLEXITY_API_KEY`; empty means unavailable), `baseURL`, `model` (default `sonar`), `maxTokens` (default 1024), and an optional `searchRecency` (`day`/`week`/`month`/`year`, sent as `search_recency_filter`).

## Model Experience

The seam's `search` tool result includes both the generated `content` answer (when non-empty) and the `sources[]` list this provider maps from Perplexity's response — a richer result shape than a sources-only provider like Exa, since Perplexity itself synthesizes an answer.

#### KV Cache effect

None; this is a separate, auxiliary model call to Perplexity's own endpoint, not part of the conversation's own cached request.

## Known Limitations and Deferred Work

- **Config is resolved once at plugin load**, matching `@freddie/freddie-web-search-exa`'s existing precedent (no live-settings-reload mechanism exists for a search provider in this codebase yet).
- **Redirects fail closed** (`redirect: 'error'`) rather than following them, matching the seam's other providers.
