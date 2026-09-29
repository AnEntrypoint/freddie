# AGENTS.md — anonymous-user-id

## Rationale

- The id is scoped to the harness home (`$FREDDIE_HOME` > `~/.freddie`), never derived from host, network, or git identity; deleting `.anonymous-user-id` mints a new identity next launch.
- Concurrent first launch is settled by exclusive-create (`wx`); the loser rereads the winner. A reread inside the winner's create-to-write window can yield two per-process ids for one run; the next launch converges. Write failure (read-only home) still returns a usable in-process id.
- The result is memoized per resolved file path, so a file deleted mid-run keeps the process id until relaunch.
- `src/invariant.js`: no runtime invariant exists because the memo and file have no independent event stream to compare without minting the identity as a side effect.
