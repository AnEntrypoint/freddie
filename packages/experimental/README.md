# experimental/ — private experimental packages

This group contains prototypes and internal-only Cordis plugins that use the repository's real runtime without joining an official release. Its packages are private, carry no stability or support promise, and retain the same engineering, security, documentation, lifecycle, testing, and snapshot requirements as release packages.

| Package | Role | ctx key |
|---|---|---|
| `agent-team/` | Implicit-root Agent Teams roster, durable peer mailbox, shared task DAG, and runtime coordination | `ctx.agentTeams` |
| `tool-agent-team/` | Scoped model-facing Agent Teams tools and collaboration guidance | — |
| `browser-use-runtime/` | Shared browser-provider library: per-live-Agent resource ownership, serialized operations, cleanup on disposal, and `mountSessionMcp` discovery | — |
| `browser-use-browserskill/` | Experimental browser-use provider: BrowserSkill Agent Windows in a user's connected Chromium profile | `ctx.browserUse` |
| `browser-use-chrome-devtools-mcp/` | Experimental browser-use provider: per-Session Chromium through the pinned `chrome-devtools-mcp` server | `ctx.browserUse` |

The [subtree rules](AGENTS.md) define dependency isolation, release exclusion, and promotion.
