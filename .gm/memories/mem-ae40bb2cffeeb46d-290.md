---
key: mem-ae40bb2cffeeb46d-290
ns: default
created: 1791106593923
updated: 1791106593923
---

## Resolved mutable: usage-map-cache-split

translate.js:18-23 reads prompt_tokens_details.cached_tokens and completion_tokens_details.reasoning_tokens. Live chunk prompt_tokens 1250 minus cached_tokens 1152 becomes inputTokens 98, outputTokens 1, cacheReadTokens 1152, reasoningTokens 50.
