# Agent Note: the Agent Teams profile bundle that composes two already-ported experimental packages

Status: implemented

## Problem

`deepseek-ai/deepseek-harness`'s `packages/experimental/agent-team-profile` is a `cordis.patch.yml` bundle applied over `dsh-base`: it disables `tool-subagent-control`, `tool-subagent-list-agents`, `tool-subagent`, and `tool-subagent-fork`, then inserts `[agent-team (Team service), tool-agent-team (Team-scoped tools), ui-agent-team (Web roster/task board)]` in one layer. Its `src/index.ts` is an empty module entry — the patch is the whole runtime content.

Freddie had already ported the two runtime halves — `packages/experimental/agent-team/src/index.js:45` (`TeamService`, `ctx.agentTeams`) and `packages/experimental/tool-agent-team/src/index.js:10` (`name = 'tool-agent-team'`, `inject = ['agents', 'agentTeams', 'tools', 'systemPrompt']`) — but never composed them. An exhaustive `codesearch` for `agent-team` under `packages/bundle` returned **0 matches across 34 files**: no bundle mounted either package, so both were unreachable from any `freddie --profile` launch. `packages/experimental/tool-agent-team/README.md` states why the composition matters and why it cannot be a naive "mount both": scoped Team definitions **shadow** same-named legacy global continuable-subagent controls, so a composition that mounts both is ambiguous by construction. Upstream resolves that by disabling the legacy surface; the port had to preserve exactly that intent.

## Decision

Port it as `packages/bundle/agent-team-profile` — a patch-only bundle over `@freddie/freddie-base`, in the same shape the sibling `acp-app` and `sdk-app` bundles established (`package.json` declaring `"freddie": { "bundle": { "patch": "./cordis.patch.yml" } }`, an empty `src/index.js` entry, an `src/invariant.js` companion, a front-mattered README, `files` listing exactly what publishes).

Adaptations from upstream, each forced by a freddie fact:

- **Package names.** `@deepseek-ai/dsh-experimental-agent-team` → `@freddie/freddie-experimental-agent-team`, same for the tool package. Patch rows resolve by package name, so transcription was never an option.
- **No `ui-agent-team` row.** Upstream's third inserted row mounts `@deepseek-ai/dsh-experimental-client-ui-agent-team`. An exhaustive whole-tree `codesearch` for `client-ui-agent-team` returns matches in a sibling's scratch file only — freddie has no Client UI package for Agent Teams at all. The row is omitted rather than renamed or stubbed, and the gap is recorded under the bundle README's Known Limitations.
- **`private: true`.** Both mounted packages are private experimental packages, so this bundle cannot publish meaningfully; `packages/bundle`'s other members are public but mount released packages. This also keeps `@freddie/freddie`'s dependency closure honest about what is releasable.
- **Explicit config, as upstream ships it.** Both inserted rows state their values (`maxMembers: 8`, `maxTasks: 256`, `maxPendingMessagesPerMember: 64`, `maxMessageBytes: 65536`, `disposalTimeoutMs: 5000`; `freshProvider: spawn`, `forkProvider: fork`) instead of inheriting schema defaults, so a later layer patches a value the dump already shows.
- **No startup plugin.** `acp-app` and `sdk-app` each ship a runtime glue plugin providing a latch service (`acpStartup`, `sdkStartup`) because a stdio app must not claim stdin before its invocation is accepted. Agent Teams needs no such latch — the Team tools install themselves per Agent scope through `ctx.agentTeams` — so the bundle matches upstream's empty entry instead of inventing a plugin for symmetry.
- **Added to `apps/cli`'s dependencies** so the in-box bundle resolves from the installation (the `resolveBundleDir` installation-first contract at `packages/boot/app-boot/src/profile.js:288`), which is what makes `freddie plugin --profile <name> add @freddie/freddie-agent-team-profile` and `--dump-config` work at all. No shipped profile template enables it: upstream ships the bundle switched off, and freddie's `PROFILE_TEMPLATES` are left untouched.

## Alternatives considered

**Mount the two rows in `packages/bundle/base/cordis.patch.yml`.** Rejected: base is every profile's first layer, so Agent Teams — an explicitly opt-in experimental feature — would become universal, and the legacy subagent rows would have to be disabled for every profile including Web and headless.

**Mount both surfaces and let shadowing resolve it.** Rejected: `tool-agent-team`'s own README names shadowing as the hazard, not the remedy. Two tools with one name is a model-visible ambiguity, and which definition wins is a registration-order detail no caller should depend on.

**Add a `ui-agent-team` row pointing at a placeholder.** Rejected: a patch row naming a package that does not exist fails at boot, not at review. The omission is documented instead.

**Give the bundle a startup plugin so all three bundles read alike.** Rejected: there is no service to latch. A plugin providing nothing would be dead weight and would misrepresent what the layer does.

**Add a row to `packages/README.md`.** Rejected: that file holds a group table (`| Group | Role | Release expectation |`), not per-package rows — `packages/bundle/README.md` is the file that owns package rows, and the `bundle/` group row already exists. A per-package row there would be a category error.

## Consequences

Verified live against the real stack with a temporary `FREDDIE_HOME` (removed afterwards), not through a hand-built context:

- `node apps/cli/src/bin.js --profile control --dump-config` over `bundles: ["@freddie/freddie-base"]` composes **82 rows**; the four legacy rows render enabled.
- `node apps/cli/src/bin.js --profile agent-team --dump-config` over `bundles: ["@freddie/freddie-base", "@freddie/freddie-agent-team-profile"]` composes **84 rows**, with a `# == @freddie/freddie-base, patched by @freddie/freddie-agent-team-profile` block carrying `disabled: true` on `tool-subagent-control`, `tool-subagent-list-agents`, `tool-subagent`, and `tool-subagent-fork`, and a `# == @freddie/freddie-agent-team-profile` block inserting `agent-team` and `tool-agent-team` with their full configs. `tool-subagent-report`, `subagent`, and both provider rows stay mounted — exactly upstream's "workflow can still create fresh children" stance.
- Both inserted packages resolve from the composed profile's own module scope (`require.resolve` and a real ESM `import` from inside the profile directory): `@freddie/freddie-experimental-agent-team` exports `TeamService` with `inject = ['agents', 'sessions', 'sessionPersistence', 'subagents']`, and `@freddie/freddie-experimental-tool-agent-team` exports `name = 'tool-agent-team'` with `inject = ['agents', 'agentTeams', 'tools', 'systemPrompt']`.
- `node scripts/publint-all.js` reports `All good!` for `packages/bundle/agent-team-profile`. (Two unrelated packages fail — `packages/api/session-controller` and `packages/llm/llm-pi-ai` — both other agents' in-flight work, untouched by this change.)

What this buys: the two already-ported experimental packages stop being dead code — one opt-in layer makes them reachable, with the legacy delegation surface turned off in the same pass so the shadowing hazard never materializes. What it costs: one more in-box bundle in the CLI's dependency closure (mounted nowhere by default), one more manifest a release pass must skip because it is `private`, and a Web roster/task board that remains absent until freddie grows a Client UI package for Agent Teams.
