# AGENTS.md — permission-presets

## Rationale

- `src/index.js` `static Config` is an inline schema call because the config catalog walks `static Config` statically.
- `src/index.js` the sandbox/approval source thunk reads the latest scope snapshot at session creation, so no process-level registration needs replacing when settings change.
- `src/index.js` projection unit and `/permission` command register as `ctx.inject` children: they activate only when a projection registry / command registry is composed, so headless assemblies are unaffected. `/permission` is the one write path a web client uses (the popup submits the picked preset as this line).
- `src/index.js` `/permission` settlement text never repeats the command name: surfaces render `name · text`, which would otherwise read `permission · Permission preset: workspace-write.`
- A switch records the selected preset, then writes changed knobs through their canonical setters; the recorded selection breaks shared-bundle ties, else the first table match wins, else the derived `custom` (never a switch target). Selecting the effective preset again appends nothing. Missing permission facts are filled before a session is published: fresh sessions take the user default, seeded ones keep effective values.
