# AGENTS.md — timeout

## Rationale

- Deadline signal: `AbortSignal.any` adopts the reason of whichever source aborts FIRST, so a race resolves to one cause; `timeoutOf()` reads `TimeoutReason` only when the timeout won, and an upstream win leaves an ordinary abort reason.
- With no timeout (background work) only the upstream signal is forwarded, or a never-aborting one when there is no upstream.
