---
description: "SDK stdio application profile for users and maintainers launching a freddie JSON-RPC runtime."
kind: "package-bundle"
---

# `@freddie/freddie-sdk-app`

## Summary

The SDK stdio application as a `freddie` profile bundle over [`freddie-base`](../base/README.md). Its patch disables module reload and model-generated session titles, sets the coding-agent persona, mounts a zero-option command provider, and starts [`freddie-sdk-jsonrpc-server`](../../sdk/server/README.md) only after that provider accepts the invocation. `freddie --profile sdk --help` therefore writes help and exits without claiming stdin or stdout.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

```sh
freddie --profile sdk
```

The startup provider binds stdin EOF to the launcher's bounded shutdown, so a client that disconnects disposes the root tree — session persistence included — and exits 0. Protocol `shutdown` keeps its own server-owned path. Stdout is reserved for newline-delimited JSON-RPC frames.

The profile ships as `sdk` in the launcher's profile templates. Out-of-tree compositions add it with `freddie plugin --profile <name> add @freddie/freddie-sdk-app`.

Relative to `freddie-base`, this bundle changes exactly four rows: it disables `hmr` (one stdio connection must never observe a replacement server), disables `session-title-llm` (the SDK exposes no title surface), restates the `system-prompt` persona, and inserts `sdk-startup` plus the JSON-RPC server row.

| Row | Package | Role |
|---|---|---|
| `sdk-startup` | `@freddie/freddie-sdk-app/startup` | Parses the zero-option invocation, publishes `sdkStartup`, binds stdin EOF |
| `sdk-jsonrpc-server` | [`@freddie/freddie-sdk-jsonrpc-server`](../../sdk/server/README.md) | Serves SDK requests over stdio; injects `sdkStartup` so it never starts before the invocation was accepted |

<a id="configuration"></a>
## Configuration

`FREDDIE_MAX_TOKENS_AS_SUCCESS` retains the SDK deployment mapping: unset or JSON `true` reports token-limited completion as accepted, while JSON `false` reports it as an error. The server row reads it at startup, so the value is a deployment decision rather than a per-turn flag.

The `profile` config on the `sdk-startup` row is the name rendered in command help and diagnostics; a bundle reusing this provider sets its own.

-----

<a id="model-experience"></a>
## Model Experience

The persona is `You are a coding agent powered by the {{model}} model.` followed by `Your working directory is {{cwd}}.`. Provider, model, and workspace `cwd` arrive through the SDK initialization request. Token and KV-cache effects are those of `freddie-base` minus one title request: stable for a fixed profile, provider, model, and tool roster.

## Known Limitations and Deferred Work

- **A profile can omit the SDK server** — a custom profile selected by a client must retain this bundle or another `freddie-sdk-jsonrpc-server` row; client initialization fails when no peer answers.
- **User patches can violate stdout purity** — this bundle writes no non-protocol stdout, but it cannot contain an arbitrary inserted plugin.
- **Configuration changes require restart** — `hmr` is disabled so one stdio connection never observes a replacement server or agent dependency.
- **The Python SDK carrier uses a different composition** — the bundled single-executable runtime loads [`examples/jsonrpc-agent/cordis.yml`](../../../examples/jsonrpc-agent/cordis.yml) directly rather than a profile bundle; this bundle is the CLI-surface counterpart.
