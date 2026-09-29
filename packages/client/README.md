# client/ — web-GUI browser half

The browser side of the freddie web GUI: shell boot, browser-host communication, shared UI services, and feature plugins. Authoring rules live in [AGENTS.md](AGENTS.md); the host half is [`host/`](../host/README.md). Every package here is a **product** package named `@freddie/freddie-client-<name>`.

| Package | Purpose |
|---|---|
| [`web/`](web/README.md) | Boots the browser shell from the client entry graph. |
| [`ui-renderer/`](ui-renderer/README.md) | Binds slot data to webjsx elements and mounts the assembled application after client boot settles. |
| [`modules/`](modules/README.md) | Loads browser-side client modules. |
| `css-manifest/` | Serves the plain CSS files as one concatenated, content-revved `/styles/app.css` link from a static build-time manifest. No README yet. |
| `vendor-modules/` | Serves the vendored ESM copies of the client's bare-specifier npm imports and the import map that resolves them to `/vendor/` URLs. No README yet. |
| [`connection/`](connection/README.md) | Maintains browser-host RPC communication and event delivery. |
| [`file-upload/`](file-upload/README.md) | Streams browser file uploads to a session with progress, cancellation, and staged receipts for later prompts. |
| [`runtime/`](runtime/README.md) | Provides shared client services for sessions, workspaces, and UI composition. |
| [`hmr/`](hmr/README.md) | Refreshes client plugins during development. |
| [`locale/`](locale/README.md) | Provides localization preferences and message dictionaries. |
| [`ui-slots/`](ui-slots/README.md) | Defines how UI features register and compose extension slots. |
| [`ui-theme/`](ui-theme/README.md) | Applies the selected color theme. |
| [`ui-primitives/`](ui-primitives/README.md) | Provides shared webjsx controls, icons, and content renderers. |
| [`ui-attachment/`](ui-attachment/README.md) | Registers composer and message-image attachment presentation. |
| [`ui-layout/`](ui-layout/README.md) | Arranges the main application regions. |
| [`ui-sidebar/`](ui-sidebar/README.md) | Presents workspace and session navigation. |
| [`ui-brand-official/`](ui-brand-official/README.md) | Fills the generic browser-brand slots with the official name and marks. |
| [`ui-workspace/`](ui-workspace/README.md) | Provides workspace selection and creation surfaces. |
| [`ui-directory-picker-browse/`](ui-directory-picker-browse/README.md) | Browses and creates directories in-app for the workspace directory flow. |
| [`ui-directory-picker-native/`](ui-directory-picker-native/README.md) | Drives the host's OS directory chooser for the workspace directory flow. |
| [`ui-conversation/`](ui-conversation/README.md) | Presents the active conversation and its input surface. |
| [`ui-artifacts/`](ui-artifacts/README.md) | Presents interactive durable artifacts and the memory workspace for a conversation. |
| [`ui-workspace-files/`](ui-workspace-files/README.md) | Presents a read-only workspace file tree with text and image preview for a conversation. |
| [`ui-deliverables/`](ui-deliverables/README.md) | Lists a turn's produced files and makes final-response file references clickable. |
| [`ui-message-feedback/`](ui-message-feedback/README.md) | Adds per-message feedback controls to the assistant-message action strip. |
| [`ui-tool/`](ui-tool/README.md) | Composes Tool call trees and keyed per-Tool views. |
| [`ui-workflow-run/`](ui-workflow-run/README.md) | Replays durable workflow runs as nested Chat disclosures with live-only child navigation. |
| [`ui-goal/`](ui-goal/README.md) | Presents and manages the current goal. |
| [`ui-trajectory/`](ui-trajectory/README.md) | Presents alternate views of agent activity. |
| [`ui-observability/`](ui-observability/README.md) | Shows a graph-first overview of the live GM PRD and mutable walk, with node inspect and edit. |
| [`ui-commands/`](ui-commands/README.md) | Provides session-aware command discovery and dispatch. |
| [`ui-input-trigger/`](ui-input-trigger/README.md) | Coordinates inline command and reference suggestions. |
| [`ui-skill/`](ui-skill/README.md) | Adds skill references to inline suggestions. |
| [`ui-reference/`](ui-reference/README.md) | Unified Web `@file` / `@session` reference source. |
| [`ui-subagent/`](ui-subagent/README.md) | Provides subagent navigation, child transcript states, and inline references. |
| [`ui-jobs/`](ui-jobs/README.md) | Lists this session's background jobs in the conversation header. |
| [`ui-open-in-app/`](ui-open-in-app/README.md) | Opens the session's workspace directory in an installed local application from the conversation header. |
| [`ui-model-selection/`](ui-model-selection/README.md) | Provides model selection in conversation surfaces. |
| [`ui-permission-presets/`](ui-permission-presets/README.md) | Configures default permissions and switches the current session's access. |
| [`ui-plan/`](ui-plan/README.md) | Presents active plan-mode status and its exit control. |
| [`ui-settings-plugins/`](ui-settings-plugins/README.md) | Owns the Plugins settings section, its tab extension point, and configurable host-plane plugin cards. |
| [`ui-settings-subagent/`](ui-settings-subagent/README.md) | Contributes the delegation depth and capacity card over the `subagent` namespace. |
| [`ui-settings-web-search/`](ui-settings-web-search/README.md) | Contributes the search provider's endpoint, key, and per-request budget card. |
| [`ui-user-questions/`](ui-user-questions/README.md) | Presents interactive questions requested by the agent. |
| [`ui-agent-preset/`](ui-agent-preset/README.md) | Selects a session's agent preset and authors preset compositions. |
| [`shortcuts/`](shortcuts/README.md) | Owns the window-local keyboard command registry and the searchable reference that rebinds commands by action, alias, or key. |
| [`ui-settings/`](ui-settings/README.md) | Hosts the settings interface and its extension areas. |
| [`ui-settings-general/`](ui-settings-general/README.md) | Provides the general settings section. |
| [`ui-settings-models/`](ui-settings-models/README.md) | Provides model-provider configuration and DeepSeek onboarding. |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.md) | Contributes the Host Loader inventory tab to Plugins settings, with an enable/disable switch per plugin. |

Each child reference owns its contract and detailed behavior. The [slot system standard](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) and [web client architecture note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) own the cross-package composition and loading decisions.

The subsystem reference is [client-modules.md](../../docs/subsystems/client-modules.md); the [slot system standard](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) is the definitive slot model, and the [web client architecture note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) owns the loading chain and object layer.
