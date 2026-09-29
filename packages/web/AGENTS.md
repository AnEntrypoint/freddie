# AGENTS.md — Web Packages

These rules supplement the package conventions in [packages/AGENTS.md](../AGENTS.md).

- **Reject redirects on credential-bearing provider requests.** Configure the HTTP client to fail before following any redirect response. Regression coverage must prove that the redirect target is not contacted and that every credentialed provider opts into the policy. The configured endpoint necessarily receives the initial request; this prevents automatic forwarding of credentials or request data to another origin, not compromise of the configured endpoint.

## Rationale

- `tool-web` `fetch.js`: table cells ignore `colspan` because GFM cannot represent spanning cells, and honouring the attribute would make conversion work and output proportional to a number instead of the source. Turndown's DOM walk recurses per element, so malformed markup can still throw `RangeError`; a conversion failure downgrades to raw HTML while provider errors stay structured `WebError`s.
- `tool-web` `search.js`: a malformed provider URL falls back to the raw string so pure formatting never throws.
- Search providers (`web-search-deepseek`, `-exa`, `-perplexity`): an abort fired mid-body surfaces as `WEB_ABORTED`, never swallowed into a generic HTTP-error message (cancellation is not a provider error). A malformed or non-JSON error body (normal for gateway 5xx/429) can only cost a richer message, never the real error.
- `web-search-exa` `provider.js`: Exa returns no generated answer (`content` omitted) and the web service owns final `maxResults` truncation, so the provider reports `truncated: false`.
- `web-search-exa` / `web-search-perplexity` `index.js`: every environment layer may name the API key; the product trusts the project it is launched in and the managed store is not involved. `web-search-deepseek` falls back to the launch environment the same way, since without the credential seam the environment is the whole credential plane.
- `web-search-deepseek` `provider.js`: options are snapshotted once per operation, because credential resolution awaits and a settings write inside that await must not pair the old section's key with the new section's endpoint. Both `x-api-key` (official DeepSeek) and `Authorization: Bearer` (Anthropic-compatible proxies) are sent so either resolves.
- `web-search-browser` `provider.js`: the daemon's response shape differs by outcome (live-verified). Success wraps the engine's `{result, stderr, ...}` under `data` beside a mirrored top-level `ok`; a transport failure (engine unavailable, empty script body) has no `data` and puts `error`/`stderr`/`note` at top level. Top-level `ok` is reliable in both.
- `web-search-perplexity` `provider.js`: `available()` stays beside each provider's own config contract; a shared base class would obscure which fields make a backend usable.
