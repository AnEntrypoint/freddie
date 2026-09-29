---
description: "Automation-only ACP stdio application profile for users and maintainers driving persistent freddie agents from an ACP client."
kind: "package-bundle"
---

# `@freddie/freddie-acp-app`

## Summary

The automation-only ACP stdio application as a `freddie` profile bundle over [`freddie-base`](../base/README.md). Its patch disables module reload and model-generated session titles, sets the coding-agent persona, mounts a zero-option command provider, and starts [`freddie-acp`](../../acp/acp/README.md) only after that provider accepts the invocation. `freddie --profile acp --help` therefore writes help and exits without claiming stdin or stdout.

## Table of Contents

- [Use this package](#use-this-package)
- [Standard automation workflow](#standard-automation-workflow)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

```sh
freddie --profile acp
```

The startup provider binds stdin EOF to the launcher's bounded shutdown, so a client that disconnects disposes the root tree — session persistence included — and exits 0. Stdout is reserved for newline-delimited ACP JSON-RPC frames.

The profile ships as `acp` in the launcher's profile templates, so `freddie --profile acp` initializes `base` + `acp-app` on first use. Out-of-tree compositions add it to any profile with `freddie plugin --profile <name> add @freddie/freddie-acp-app`.

Relative to `freddie-base`, this bundle changes exactly four rows: it disables `hmr` (one stdio connection must never observe a replacement bridge), disables `session-title-llm` (ACP exposes no title surface, so the auxiliary request would buy a value nobody can read), restates the `system-prompt` persona, and inserts `acp-startup` plus the `acp` bridge row.

| Row | Package | Role |
|---|---|---|
| `acp-startup` | `@freddie/freddie-acp-app/startup` | Parses the zero-option invocation, publishes `acpStartup`, binds stdin EOF |
| `acp` | [`@freddie/freddie-acp`](../../acp/acp/README.md) | The ACP v1 bridge; injects `acpStartup` so it never starts before the invocation was accepted |

The shipped row creates sessions with `deepseek-official` and `deepseek-v4-flash`; a later patch layer can replace that row's config.

-----

<a id="standard-automation-workflow"></a>
## Standard automation workflow

An ACP v1 client initializes the profile, creates a session with an absolute `cwd`, prompts while observing semantic updates, then disconnects. The complete supported method matrix, MCP trust model, and stop reasons live in the [`freddie-acp` protocol contract](../../acp/acp/README.md). This profile adds no private method, capability, or transport field.

-----

<a id="model-experience"></a>
## Model Experience

The persona is `You are a coding agent powered by the {{model}} model.` followed by `Your working directory is {{cwd}}.`, resolved per session from the ACP route and the client-supplied `cwd`. Token and KV-cache effects are those of `freddie-base` minus one title request: stable for a fixed profile, provider, model, and tool roster.

## Known Limitations and Deferred Work

- **A profile can omit the ACP bridge** — a custom ACP launch profile must retain this bundle or another `freddie-acp` row; otherwise no peer answers the client.
- **User patches can violate stdout purity** — profile and per-launch patches are trusted application composition. This bundle writes no non-protocol stdout, but it cannot contain an arbitrary inserted plugin.
- **Configuration changes require restart** — `hmr` is disabled so one stdio connection never observes a replacement bridge or agent dependency.
- **The base layer is the whole product core** — every `freddie-base` row mounts, including Web search and the gm tools. A deployment that wants the smaller tree mounts [`examples/jsonrpc-agent/minimal.cordis.yml`](../../../examples/jsonrpc-agent/minimal.cordis.yml)'s selection instead.
