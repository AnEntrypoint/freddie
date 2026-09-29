# AGENTS.md — cmdline

## Rationale

- `src/index.js` `parseCmdline`: reads `cmdlineArgs` and `appExit` through the global service store (`ctx.get`), not the property proxy. `appExit` is an optional host value and a plugin only needs to inject `cmdlineArgs`.
