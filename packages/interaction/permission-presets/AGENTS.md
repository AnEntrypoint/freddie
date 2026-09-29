# AGENTS.md — permission-presets

## Rationale

- `src/index.js` `static Config` is an inline schema call because the config catalog walks `static Config` statically.
- `src/index.js` the sandbox/approval source thunk reads the latest scope snapshot at session creation, so no process-level registration needs replacing when settings change.
- `src/index.js` projection unit and `/permission` command register as `ctx.inject` children: they activate only when a projection registry / command registry is composed, so headless assemblies are unaffected. `/permission` is the one write path a web client uses (the popup submits the picked preset as this line).
- `src/index.js` `/permission` settlement text never repeats the command name: surfaces render `name · text`, which would otherwise read `permission · Permission preset: workspace-write.`
