# AGENTS.md — shell

- Foreground results carry nullable `exitCode`/`signal`, separate `timedOut`/`aborted` facts, `timeoutMs`, and collected `stdout`/`stderr` (`text`, `truncated`, optional `spillPath`).
- Background handles carry `status` (running/completed/killed), nullable exit facts, a never-rejecting `done` promise, incremental `readOutput()` (`delta`, `lossy`, optional stream spill paths), and `kill()`. Callers distinguish timeout from cancellation and preserve non-repeating output reads.
