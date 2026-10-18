# AGENTS.md — subprocess

- A published process handle exposes `pid`, raw streams only for piped stdio, bounded readers in `collected` only for collect-mode streams, and `done` with nullable exit code and signal. Spawn failures reject `done`; command failures resolve with exit facts.
- `terminate()` owns tree escalation; `waitForExit(signal?)` proves whole-tree quiescence or resolves `false` when its wait is cancelled. A direct-child outcome alone never proves descendants exited.
