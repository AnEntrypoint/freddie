# Agent Note: Live process observability

Status: implemented

## Problem

Freddie exposes durable workflow runs, subagent lineage, background jobs, and GM dispatch results through separate surfaces. The Web UI needs a coherent operational view without browser filesystem access or a second source of truth.

## Decision

`@freddie/freddie-tool-gm` owns the durable `gm/progress` record after a successful GM dispatch. `@freddie/freddie-gm-progress` folds that complete event into the `gmProgress` session projection, which the existing history and `session/projection` carriers replay to Web clients. The Web bundle mounts `@freddie/freddie-client-ui-observability` as an HMR-served selected-session view. Its BLUF overview and focused activity tabs consume GM, durable workflow nodes, retained subagent lineage, the durable agent ledger, and live terminal activity at their current UI boundaries. Descendant rows prefer the existing session display title and retain a short ID for disambiguation. The overview reports the agent connection and browser HMR journal independently, because their event streams have separate lifecycles. The client runtime retains bounded mux-delivered events and terminal snapshots for unselected sessions, allowing a selected parent to observe its known descendant tree without navigating to or resuming child sessions.

Persistent terminal processes remain owned by `ctx.terminals`. The terminal registry authorizes all operations with the exact owner Agent and provides bounded reads, direct keyboard input, resize, signals, send operations, and owner-local activity subscriptions. The loopback-only `terminal.*` API resolves the addressed session to that Agent and carries activity through the existing mux stream. Terminal output remains process-local and does not join the session log.

## Alternatives considered

**Browser `.gm` polling.** It bypasses session ownership, cannot replay historical state through the existing carrier, and gives browser code filesystem authority it does not need.

**Projection every terminal output chunk.** Whole session projections are low-rate replay values. High-rate PTY output stays process-local until a bounded live terminal carrier owns its retention and reconnection contract.

**Extending historical `TerminalBlock`.** It represents settled tool output and has no terminal screen, cursor, input, or resize lifecycle. An interactive terminal requires a dedicated presentation and transport path.

## Consequences

GM progress survives reloads and follows the standard session projection path. Workflow runs and subagent lineage retain their durable conversation and header renderers, while the dock gives users one live entry point. The terminal dock communicates availability without fabricating a terminal screen before the terminal Remote and emulator-backed stream are present.
