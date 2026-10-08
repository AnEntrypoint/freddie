# Agent Note: BrowserSkill browser-use provider

Status: implemented

## Problem

Freddie can drive an isolated Chromium instance through the experimental Chrome DevTools MCP provider, but that provider intentionally excludes the user's logged-in browser profile. BrowserSkill provides a different capability: visible Agent Windows in a user-selected connected Chrome or Edge profile, controlled through a local `bsk` CLI and extension. The existing `ctx.browserUse` seam needs a provider that preserves BrowserSkill's session ownership, tab-borrow confirmation, human-assistance controls, and daemon lifecycle rather than treating the CLI as an arbitrary shell command.

## Decision

`packages/experimental/browser-use-browserskill` supplies `@freddie/freddie-experimental-browser-use-browserskill`, an opt-in BrowserSkill provider for `ctx.browserUse`. The provider groups BrowserSkill into `browserskill_status`, `browser_session`, `browser_page`, `browser_inspect`, `browser_interact`, `browser_tabs`, and `browser_assist`; each tool builds structured `bsk --json` argv through Freddie's `subprocess` service without a shell.

The provider records session ids by exact calling Agent identity. Model calls can use only recorded sessions, must select one explicitly when their Agent owns more than one, and cleanup stops all recorded sessions when the Agent or provider disposes. It neither enumerates nor operates BrowserSkill sessions created by another program. Agent Windows retain BrowserSkill's own borrow-confirmation and human-help settings.

The base bundle resolves the package but leaves its row disabled. An operator enables it in a profile that has installed `bsk` and connected the Chrome or Edge extension. The competing Chrome DevTools MCP provider is also disabled by default because `ctx.browserUse` accepts one provider and browser automation must be an explicit deployment choice.

## Operational boundary

`browserskill_status` runs `bsk doctor --json` to distinguish a missing CLI, daemon problem, and disconnected extension before a model starts work. A disconnected extension stays an actionable BrowserSkill readiness failure; Freddie never launches an isolated browser or changes BrowserSkill settings to make the request appear successful.

The managed subprocess provider supplies environment scrubbing, output bounds, cancellation, and whole-process-tree teardown. BrowserSkill responses remain model-visible only through normal tool results, and BrowserSkill page content is explicitly untrusted data in the model-facing tool descriptions.

## Alternatives considered

**Chrome DevTools MCP only**: rejected because it launches or attaches a CDP browser rather than integrating BrowserSkill's logged-in profile, Agent Window, borrowing, human-help, and debugging workflows.

**Expose raw `bsk` through Bash**: rejected because it cannot enforce Agent-owned session identity or lifecycle cleanup, gives the model a shell-shaped rather than capability-shaped interface, and makes BrowserSkill's session contract optional.

**Enable BrowserSkill in every base profile**: rejected because a `bsk` binary plus connected extension grants access to a logged-in browser and must remain an operator-selected capability. The disabled row keeps package resolution and documented configuration available without executing a browser command.

**Port BrowserSkill's DSH UI wholesale**: rejected for this provider: the host-side capability and lifecycle boundary are necessary first, while a dedicated Freddie Web browser pane and screenshot attachment presentation evolve independently on the client plane.

## Consequences

The experimental browser-use catalog has two explicit providers with mutually exclusive `ctx.browserUse` registration. BrowserSkill covers its documented CLI feature set through grouped model tools, including page observation, navigation, interaction, tabs, website debugging commands, files, emulation, and human assistance. The first live verification records actual local daemon and extension readiness; end-to-end browser actions remain contingent on a user connecting the extension.
