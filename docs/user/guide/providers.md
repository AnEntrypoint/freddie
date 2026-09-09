# Configure models

This guide assumes you started the Web UI through the [root README](../../../README.md#run). Model changes take effect on the next request without restarting the server.

## Configure DeepSeek

Open **Settings → Models**. The DeepSeek card exposes one API-key field; enter the key and save it.

![The Models page: the DeepSeek card, with Add provider below it](providers-models-page.png)

Keys are write-only. The page receives a redacted descriptor after saving, never the literal secret. The key is stored in `$FREDDIE_HOME/.credentials.yaml`, while settings retain only its credential reference.

Under **Model catalog**, DeepSeek's shipped id/name/context-window catalog is used as-is; the page has no field to add or override a model for this provider.

## Select a model

Configured providers appear in the model picker. Selecting a model also makes it the default for new sessions. A session that has already sent a request retains the model recorded in its own log.

If a saved default names a provider that was deleted, the composer displays **Select model** and blocks input until another model is selected.

## Troubleshooting

- **`MISSING_CREDENTIAL`** — Store the provider key through the Models page or supply the referenced environment variable.
- **`UNKNOWN_MODEL`** — Select a configured model.
- **An image is refused before sending** — DeepSeek's chat-completions route is text-only and cannot be configured otherwise.

## Advanced configuration

The generated [plugin configuration catalog](../../config-catalog.md) lists every supported field and default for every plugin; the [`dsh-llm-deepseek`](../../../packages/llm/llm-deepseek/README.md) reference owns direct `settings.yaml` configuration, catalog resolution, reasoning controls, credentials, and adapter errors.

### Cross-provider fallback on a DeepSeek outage

The `llm-deepseek` adapter is a single-provider OpenAI-compatible client: if `api.deepseek.com` itself is down or rate-limited, the harness has no built-in path to another provider and the turn fails with `All upstream providers are currently unavailable`. [acptoapi](https://github.com/AnEntrypoint/acptoapi) is the harness's designated multi-provider chain-fallback bridge (see its own `AGENTS.md`, "downstream consumers... must NOT reimplement these locally"); pointing this adapter's `baseURL` at a running acptoapi gateway gives every DeepSeek request an automatic fallback chain with no adapter code changes, since the adapter already speaks plain OpenAI-compatible HTTP against any configured endpoint:

1. Run acptoapi as a local gateway: `cd path/to/acptoapi && node bin/acptoapi.js --port 8788` (needs its own provider credentials configured, e.g. `~/.acptoapi/.env` and, for xAI Grok, a device-code login via `node bin/acptoapi.js --xai-oauth-login`).
2. Set `DEEPSEEK_BASE_URL=http://127.0.0.1:8788/v1` in the harness's launching environment (or the `baseURL` field in a `llm-deepseek:` settings-document section — no restart needed, per [Dynamic configuration](../../../packages/llm/llm-deepseek/README.md#dynamic-configuration-settings-and-credentials)).
3. Use a comma-separated chain string as the model id, e.g. `deepseek/deepseek-v4-flash, xai-oauth/grok-4.6` — acptoapi tries each link in order and only fails the whole request once every link is exhausted.

Verified live (2026-09-06): a POST to a local acptoapi gateway with `model: 'deepseek/<bad-model>, xai-oauth/grok-4.6'` correctly fell through to grok-4.6 and returned a real completion (`X-Acptoapi-Chain-Attempts: 2`), after fixing a real defect in acptoapi's `/v1/chat/completions` handler that had been silently treating the whole comma string as one link (see acptoapi's own CHANGELOG).
