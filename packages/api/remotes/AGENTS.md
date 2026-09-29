# api-remotes

## Rationale

- `agentFor` (`src/agent-lookup.js`): `options.setup` is built from the inspected session before the published-session and published-agent re-checks, so those stay adjacent to `agents.resume` and a Host setup that awaits (composing a preset, say) does not widen the ownership-collision window.
- `apply` (`src/client/index.js`): the optional contributions mount in try/catch so a mount error neither unwinds the required namespaces nor blanks the shell. `session-controller` is deliberately not listed, and its `./remote` is not in `freddie.client.external` either: the browser has no consumer of that namespace by design (the page uses the legacy `/api/session.*` routes; see the session-controller `AGENTS.md`), and its `./client` entry is not a `freddie.client` row, so nothing mounts it. `terminal-controller/remote` is mounted but inert: no UI calls it and every `terminal.*` method is loopback-pinned. Disposers unwind in reverse mount order so a namespace never outlives one mounted after it.
