# AGENTS.md — Web Packages

These rules supplement the package conventions in [packages/AGENTS.md](../AGENTS.md).

- **Reject redirects on credential-bearing provider requests.** Configure the HTTP client to fail before following any redirect response. Regression coverage must prove that the redirect target is not contacted and that every credentialed provider opts into the policy. The configured endpoint necessarily receives the initial request; this prevents automatic forwarding of credentials or request data to another origin, not compromise of the configured endpoint.

## Rationale

- `tool-web` `fetch.js`: table cells ignore `colspan` because GFM cannot represent spanning cells, and honouring the attribute would make conversion work and output proportional to a number instead of the source. Turndown's DOM walk recurses per element, so malformed markup can still throw `RangeError`; a conversion failure downgrades to raw HTML while provider errors stay structured `WebError`s.
- `tool-web` `search.js`: a malformed provider URL falls back to the raw string so pure formatting never throws.

- tool-web persists output.presentationMeta for result cards: search retains available source fields and optional provider answer; fetch retains URL, status, and effective truncation from provider limits, source cuts, and complete output bounds. Replayed presenters read metadata, never parsed text headers; do not duplicate fetched body text there.
