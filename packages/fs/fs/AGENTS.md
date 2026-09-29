# @freddie/freddie-fs

## Rationale

- Service Definition for `ctx.fs` per execution world. Backends own target identity, process paths and file URIs, containment, text reads, decoding, binary rejection and atomic mutations. Read windows and observed-state policy live in `freddie-tool-fs` and `freddie-fs-observation-policy`; `editText` stays here so version check, literal match and rewrite share one critical section.
- Targets keep identity across aliases (`targetKey` is opaque; consumers never build keys or versions, only backends brand them). `processPath` is deliberately separate from `targetKey`: pass it to another OS capability, never parse the key. `contains` compares two targets from the same provider without exposing key syntax.
- `stat` returns metadata or `undefined` when absent; `lstat` is path-shaped (does not follow the final symlink) so a consumer can reject the path before `resolve` follows it. Listings are content-free and name-ordered. `readBytes` carries `maxBytes` at the seam so no backend buffers an unbounded file (`FS_TOO_LARGE`). `readTextStream` owns cross-chunk UTF-8 decoding and binary rejection.
- Writes and edits take an optional guard (`expected`); omission means unconditional. A stale guard is checked before matching (`FS_STALE_VERSION`). `sandboxPolicy` is honored only by a confining backend; the bare backend ignores it. `sandboxMode` is `undefined` unless the backend confines, and is the default-relative capability fact the tool layer reads to advertise escalation (session overrides may narrow or widen, so strict-wider checks run per call).
- `FsError` extends `HarnessError` with a stable `FsErrorCode` and chained `cause`, so backends and policy raise the same codes.
