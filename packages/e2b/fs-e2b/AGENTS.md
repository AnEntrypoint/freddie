# @freddie/freddie-fs-e2b

## Rationale

- Streamed read: the pinned E2B SDK's stream overload returns `''` (not a `ReadableStream`) for an empty file (content-length 0); the reader maps that to an empty stream.
- The stat preflight bounds the at-rest size; the streamed byte count bounds a file that grows after the stat, without transferring past the first overflowing chunk.
- Stream-cancellation failures are swallowed (the primary read outcome owns the result). After a committed write, or on a failed one, only the private staging directory cleanup is swallowed; the original failure or the committed write owns the outcome.
