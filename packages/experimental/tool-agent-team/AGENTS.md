# @freddie/freddie-experimental-tool-agent-team

## Rationale

- Wait tool: an invalid `timeout_ms` falls through to `waitForChange` so `TeamService` keeps authoritative timeout validation ahead of the model-only no-progress shortcut.
- The active-peer read and waiter registration are one synchronous span; awaiting between them can lose the only peer-status edge.
