# AGENTS.md — tmux-context

## Rationale

- Default-on but inert without tmux: `apply` returns before registering a listener on win32 (the query is a POSIX shell script and the shell executor there is pwsh) and when `$TMUX_PANE` is missing or not `%<digits>`. Before this guard a Windows session spawned one sandbox runner process per turn for a command that could never succeed.
- The first definitive negative (nonzero exit, missing binary, executor rejection) sets `paneAbsent` for the life of the process: the process's tty and pane id cannot change, so repeating the query only spawns. Timeouts, aborts and malformed readings are transient and are not remembered.
- The command is a constant plus `process.pid` (a number). `$TMUX_PANE` is read by the child shell from its own environment and is never interpolated, and the in-process `%<digits>` check keeps a hostile environment value from reaching the child at all.
