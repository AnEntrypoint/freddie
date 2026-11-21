# `@freddie/freddie-base`

The shared freddie core as a profile bundle: [`cordis.patch.yml`](cordis.patch.yml) inserts every base plugin row — model adapters, the shared [`agent-default-model`](../../core/agent-default-model/README.md) selection, tools, persistence, policy, settings/credentials, telemetry, and the core spawn/fork subagent providers — over the empty profile root, as the first layer of every profile's `freddie.profile.bundles` list. The optional Codex and Claude Code providers stay outside this package and its production dependency closure; a Profile installs either [product provider Bundle](../../subagent/README.md) only when needed. The default `@freddie/freddie` production closure therefore includes neither product provider, the Claude Agent SDK, nor the Codex wrapper and platform payloads. Later bundle layers (e.g. [`freddie-web-app`](../web-app/README.md)) and the user's profile `cordis.patch.yml` override these rows by id; a patch replaces a row's whole `config`, so mode-specific values live in mode bundles, not here. The package has no runtime API; the profile composer resolves the patch through the `freddie.bundle.patch` manifest field, never through code.


The row set and its rationale are documented inline in the patch file; the [generated composition graph](../../../apps/cli/composition.md) renders it.

## Model Experience

Indirectly, through the inserted rows: this bundle selects the shipped persona-less prompt base, tool set, and DeepSeek adapter that mode bundles specialize, and contributes no model-visible text of its own.

#### KV Cache effect

None directly; each inserted row's package owns its effect.

## Known Limitations and Deferred Work

- **A patch replaces whole row configs** — profile overrides must restate every field a row keeps; there is no deep-merge layer.
