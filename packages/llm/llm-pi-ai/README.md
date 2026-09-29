# freddie-llm-pi-ai

pi-ai library-backed multi-provider adapter for the Freddie LLM seam.

One plugin instance owns a **dict of provider routes**. A route naming an installed pi-ai
provider inherits that provider's endpoint, protocol, and model catalog as defaults and the
profile overrides them field by field; a route pi-ai does not ship is declared outright. Profile
facts resolve per request over the optional `llm-pi-ai` user-settings section and the optional
credential seam, so a changed key, endpoint, model, or knob reaches the next request without a
restart. A changed *route set* — or a route's registration-captured retry policy — re-registers
the same adapter instance in place.

pi-ai (`@earendil-works/pi-ai`, MIT) is a unified LLM access library: a model registry, one
`Provider` per vendor, several wire protocols, and a single streaming event vocabulary. This package
is the translation between that library and the harness seam — it owns no HTTP of its own.

## Plugin

| Export | Value |
|---|---|
| `name` | `llm-pi-ai` |
| `inject` | `['llm']` |
| `Config` | schemastery schema: `{ providers: dict<profile> }` |

The companion invariant registers through the `./invariant` entry (`@freddie/freddie-llm-pi-ai/invariant`).

## Configuration

```yaml
- id: llm
  name: '@freddie/freddie-llm-pi-ai'
  config:
    providers:
      # Catalog route: everything but the credential comes from pi-ai.
      openai:
        apiKeyEnv: OPENAI_API_KEY
        retryPolicy:
          mode: normal
          maxRetries: 2
      # Catalog route with the catalog narrowed and one capacity corrected.
      anthropic:
        apiKeyEnv: ANTHROPIC_API_KEY
        models:
          - id: claude-sonnet-4-5
            contextWindow: 200000
      # Hand-declared route: pi-ai ships nothing under this key.
      acme-gateway:
        displayName: Acme Gateway
        apiKeyEnv: ACME_GATEWAY_API_KEY
        api: openai-completions
        baseURL: https://gateway.acme.example/v1
        compat:
          thinkingFormat: deepseek
        models:
          - id: acme-large
            name: Acme Large
            contextWindow: 65536
            maxTokens: 4096
          - id: acme-think
            name: Acme Think
            contextWindow: 262144
            maxTokens: 32768
            reasoningEfforts:
              off:
              high: high
              max: ultra
```

A route key is not required to name an installed provider. `displayName` is what selectors show;
`apiKeyEnv` is a credential reference resolved through `ctx.credentials` (falling back to the
launch environment) and handed to pi-ai as the request's highest-priority auth override — a named
reference that misses fails the request with `MISSING_CREDENTIAL` rather than falling back to
ambient discovery, so one tenant's key can never be billed for another's request. A route that
names no credential at all defers to pi-ai's provider-native discovery.

`thinkingBudgets`, `cacheRetention`, `transport`, `timeoutMs`, `websocketConnectTimeoutMs`,
`streamIdleTimeoutMs`, `maxRequestImageBytes`, `requestImagePixelBudget`, `requestImageMaxBytes`,
`headers`, `reasoning`, and `retryPolicy` are per-route knobs; `headers` may not collide with
harness attribution names (attribution wins).

### Protocols

`api` accepts `openai-completions`, `openai-responses`, or `anthropic-messages`. Catalog routes
still reach every protocol pi-ai ships through their own provider; only an explicit override is
refused. Bedrock, Vertex, Azure, and Codex cannot be expressed by a key plus endpoint plus headers,
so they are reachable only as catalog routes.

## Model discovery

The plugin registers discovery for the `llm-pi-ai` settings namespace. A route pi-ai's catalog
ships is answered from that catalog with no network call. Anything else is interrogated over the
wire at `{baseURL}/models` (OpenAI, bearer) or `{root}/v1/models` (Anthropic, `x-api-key` plus
`anthropic-version`). The parser accepts the standard `data` array and the enriched `models` map
some gateways expose, skips unusable rows, and refuses replies over 4 MiB. A protocol with no
readable listing fails with `DISCOVERY_UNSUPPORTED` so a surface falls back to hand-entry.

## Authorization

Every installed catalog provider that ships a login gets an authorization flow, registered from
the moment the plugin mounts — signing in is what makes a route worth adding. Flows register only
in a composition that mounts the `authorization` seam; a provider id outside the credential-record
grammar is skipped with a warning. The flow translates
pi-ai's `AuthInteraction` events and prompts into the seam's neutral notice/prompt vocabulary and
lets pi-ai persist the result, so pi-ai stays the single writer of the credential record.

## Images

A route's request images are resolved per request through the durable attachment service under the
route's pixel and byte budgets, and re-encoded into every request body as base64. Because history
is replayed in full each turn, retained image payload is bounded by `maxRequestImageBytes`: past
it, the oldest images are replaced by a deterministic text placeholder, oldest first. A model that
does not admit images refuses the request before anything is sent.

## Replay

Durable harness content is authoritative. The adapter stores only the provider-native metadata
needed to reconstruct a pi-ai assistant message — response id, thinking level, and per-block
signatures — and a replay state this build cannot use degrades that one message to
provider-neutral history with a warning instead of failing the request.

## Errors

Terminal pi-ai failures become `finish` chunks rather than thrown errors. Codes include `AUTH`,
`RATE_LIMIT`, `QUOTA`, `INVALID_REQUEST`, `SERVER`, `TIMEOUT`, `TRANSPORT`,
`CONTEXT_WINDOW_EXCEEDED`, `EMPTY_RESPONSE`, `ABORTED`, and `PI_AI_ERROR` for an unclassified
provider failure. Configuration and request-shape faults throw: `NO_ADAPTER`, `UNKNOWN_MODEL`,
`INVALID_CONFIG`, `UNSUPPORTED_CONTENT`, `UNSUPPORTED_OPTION`, `UNSUPPORTED_REASONING_EFFORT`,
`MISSING_CREDENTIAL`, `NO_CREDENTIAL_STORE`. A stream idle past `streamIdleTimeoutMs` throws
`TIMEOUT`, a caller abort throws `ABORTED`, and an event stream that ends without a terminal event
throws `STREAM_CLOSED`. An unusable replay state never surfaces as `INVALID_REPLAY_STATE`: it is
caught and degraded, as described under Replay.
