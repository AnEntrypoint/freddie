# Agent Note: Live harness credentials, title, preset, and discovery defects

Status: implemented

## Problem

A live `dsh web` session on this checkout showed independent product defects after schema validation was dropped to pass-through stubs. `POST /api/credentials.describe` with no `refs` array returned HTTP 500 (`payload.refs.map` on `undefined`). `credentials.set`/`unset` with an empty payload threw on `value.length` / `ref.toUpperCase` (the latter because `RegExp.test` stringifies `undefined` to `"undefined"`, which matches the POSIX identifier grammar). `session.updateQueue` without `action` returned HTTP 500 (`action.kind`). `skill.list` without `sessionId` answered `session "undefined" not found`. `agentPreset.read`/`openDocument`/`remove` with no id resolved the default preset, so a missing-id remove aimed at the shipped default. Shipped `preset.yml` files still published Chinese display names. The first-prompt title model accepted the gateway sentence `All upstream providers are currently unavailable. Please retry shortly.` as a successful title. `llm.discoverModels` for `settingsNs=llm-deepseek` failed with `NO_DISCOVERY` because the DeepSeek plugin never registered a discovery offer.

## Decision

Unary handlers that previously dereferenced missing payload fields now return 200 `bad-request` instead of throwing or interpolating `"undefined"`. `isCredentialRefName` / `isCredentialKeySegment` require a string before the regex. `agentPreset.read`/`copy`/`openDocument`/`remove` require an explicit id and no longer fall through to `defaultId` on a missing payload. Shipped `apps/cli/config/agent-presets/*/preset.yml` name and description match the English locale strings; the roster example in the agent-presets README matches. `generateSessionTitleWithLlm` rejects that exact outage sentence so the deterministic fallback remains. `@freddie/freddie-llm-deepseek` registers model discovery for `llm-deepseek`: a request that names `deepseek-official` without `baseURL` returns the resolved catalog; any other request lists `{baseURL}/models` with attribution headers.

## Alternatives considered

**Restore Zod validation on credentials.describe.** Rejected: schema files are identity stubs repo-wide; restoring one schema would not survive the next passthrough sweep. The handler is the remaining enforcement point.

**Localize preset.yml through the client only.** Rejected for the wire: `agentPreset.list` is also consumed by non-GUI clients, and Chinese file metadata is what they see. Client `presetDisplayText` still localizes known system presets; English file text is the fallback for every other consumer.

**Reject every title that equals any assistant error.** Rejected: too broad, and it would drop legitimate titles that quote an error. The witnessed failure is one exact gateway sentence streamed as a successful completion.

**Leave discoverModels unimplemented and tell the Models page to edit the catalog by hand.** Rejected: `llm.providers` already advertises `settingsNs=llm-deepseek` as the discovery key, so the missing registration is a broken contract, not a deferred feature.

## Consequences

Malformed unary payloads stay 200 business errors. English-locale and RPC consumers see English shipped preset names. A title-model outage no longer overwrites the fallback title. The Models page can interrogate a DeepSeek-compatible endpoint. A missing-id `agentPreset.remove` can no longer aim at the default preset.

## Verification

Live GUI `http://127.0.0.1:4914`. Before the handler change, `credentials.describe` without `refs` returned HTTP 500 `TypeError: Cannot read properties of undefined (reading 'map')`; with `refs: []` it returned 200. Empty `credentials.set`/`unset` returned `credential-rejected` with a TypeError. Empty `session.updateQueue` returned HTTP 500. `agentPreset.list` returned Chinese `标准模式` for `standard`. `llm.discoverModels {settingsNs:llm-deepseek, provider:deepseek-official}` returned `model-discovery-failed` / `NO_DISCOVERY`. Session `session-64d109e7` recorded the outage sentence as `session/title` source `session-title-first-prompt-llm`. After the file changes, empty payloads for those methods return 200 `bad-request`; `agentPreset.list` returns English names; `llm.discoverModels` returns the configured catalog.
