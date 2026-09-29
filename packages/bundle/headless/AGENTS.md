# AGENTS.md — headless bundle

## Rationale

- src/index.js `run`: this bundle composes no preset roster, so model-facing rows sit in the host plane and the agent reads them from the global layer. A deployment that configures a roster must join it first (@freddie/freddie-agent-presets README, "Composing a child agent").
- src/index.js `apply`: `appExit` is read through `ctx.get` (global service store), not the property proxy, because it is an optional launcher-provided host value, never an injected dependency.
