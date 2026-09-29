---
description: "Agent Teams profile bundle, on by default in every shipped profile template: Team service and Team-scoped tools over freddie-base, with legacy global subagent delegation disabled."
kind: "package-bundle"
---

# `@freddie/freddie-agent-team-profile`

## Summary

The [Agent Teams](../../experimental/agent-team/README.md) profile as a `freddie` patch layer over [`freddie-base`](../base/README.md). One bundle mounts the Team service and the Team-scoped model tools and turns the legacy global continuable-child delegation surface off, because [Team-scoped definitions shadow same-named legacy ones](../../experimental/tool-agent-team/README.md) and a composition that mounts both is ambiguous. Every shipped profile template (`web`, `headless`, `acp`, `sdk`) lists it after its app bundle; a profile opts out by dropping it from a user-owned bundle list or by disabling its two rows in the profile patch.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

```sh
freddie plugin --profile <name> add @freddie/freddie-agent-team-profile
```

The profile must already contain `@freddie/freddie-base`: this layer patches base's rows by id and consumes base's Subagent services and providers. Inspect the result without booting it:

```sh
freddie --profile <name> --dump-config
```

Removing the package with `freddie plugin --profile <name> remove @freddie/freddie-agent-team-profile` drops the layer, which restores the four legacy rows because base — not this bundle — mounts them (see Known Limitations for a profile whose list equals an old shipped tuple).

### What you get

Direct delegation becomes `spawn_teammate`, with `fresh` and `fork` context; teammates coordinate through Team-scoped roster, messaging, interruption, waiting, and shared task-board tools. The `subagent`, `subagent_fork`, and global continuable-child control tools are disabled; the underlying Subagent services and both providers stay mounted, so workflow's fresh one-shot children keep working and the Team tools keep creating real children through them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The package's runtime content is [`cordis.patch.yml`](cordis.patch.yml) — an ordered patch over `freddie-base`, applied after it, that disables four rows and inserts two. `src/index.js` is an empty module entry; the patch is the substance.

| Row | Package | Role |
|---|---|---|
| `agent-team` | [`@freddie/freddie-experimental-agent-team`](../../experimental/agent-team/README.md) | The `ctx.agentTeams` service: roster, durable peer mailbox, shared task DAG, runtime lifecycle |
| `tool-agent-team` | [`@freddie/freddie-experimental-tool-agent-team`](../../experimental/tool-agent-team/README.md) | Team-scoped model tools and collaboration policy, installed per Agent scope |

| Disabled row | Why |
|---|---|
| `tool-subagent` | Global continuable delegation; `spawn_teammate` replaces it |
| `tool-subagent-fork` | Global one-shot fork delegation; `spawn_teammate` with `fork` context replaces it |
| `tool-subagent-control` | Global child control whose `send_message` the Team-scoped tool shadows |
| `tool-subagent-list-agents` | Global child listing whose name the Team-scoped `list_agents` shadows |

Both inserted rows state their configuration explicitly rather than inheriting defaults, so a later layer patches a value that is already visible in the dump.

-----

<a id="model-experience"></a>
## Model Experience

### Team policy and tools

#### What the model sees

The Team policy and the ten Team tool schemas belong to [`@freddie/freddie-experimental-tool-agent-team`](../../experimental/tool-agent-team/README.md) and appear only inside Team member scopes. This bundle changes composition only: direct delegation moves from `subagent`/`subagent_fork` to `spawn_teammate`, and child control moves from the global `send_message`/`list_agents`/`interrupt_agent` trio to the Team-scoped ones. Workflow's `agent()` calls still create fresh one-shot children, whose prompts must carry the context their task needs.

#### Token effect

The bundle adds the Team policy and tool schemas and removes the four legacy delegation tool schemas. It adds no prompt text of its own.

#### KV Cache effect

Composition is prefix-stable while the patch, Team identity, and configured tool schemas stay unchanged.

## Known Limitations and Deferred Work

- **Unreleased, on by default** — the manifest is `private` because both packages it mounts are private experimental packages; every shipped profile template lists it. Removing it from a profile whose list still equals an old shipped tuple is undone on the next load; disable the `agent-team` and `tool-agent-team` rows in the profile patch instead, and re-enable the four legacy rows.
- **No Web roster or task board** — upstream's equivalent bundle also mounts a `ui-agent-team` browser row. Freddie has no Client UI package for Agent Teams, so this layer mounts the service and tools only; members, tasks, and teammate sessions have no browser surface yet.
- **Shared checkout** — every teammate observes the same working directory; this layer adds no worktree isolation or filesystem locking.
- **Preset-scoped child controls** — a preset's own composition can still mount continuable Subagent controls in its own scope; this top-level layer does not reach into those registrations. The shipped `standard`, `code` and `cordis` presets guard their four delegation rows with `disabled: !!js "ctx.get('agentTeams') !== undefined"`, and a user preset copied from an older shipped one must add the same guard.
- **Fixed-prompt presets** — the `minimal` preset's complete persona suppresses the Team policy section, so the bundle sets `excludePresets: [minimal]` on `tool-agent-team` and that preset's agents get no Team tools.
- **Base profile required** — the patch targets row ids and Subagent providers supplied by `@freddie/freddie-base`; it is not a standalone profile.
