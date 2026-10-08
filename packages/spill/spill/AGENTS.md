# AGENTS.md — spill

- `saveText({ owner: { sessionId }, source: { toolName, callId?, label }, suggestedName, content })` persists exact text and returns `{ locator, bytes, retrievalHint }`. Treat the locator as opaque and the suggested name as untrusted naming input; `bytes` counts the stored bytes.
- Forks inherit existing locators without copying or re-owning artifacts; later writes use the child session namespace. Source metadata describes provenance and never grants access.
