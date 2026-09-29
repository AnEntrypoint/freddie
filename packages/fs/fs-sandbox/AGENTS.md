# @freddie/freddie-fs-sandbox

## Rationale

- `workspace-write` re-checks containment on the fresh canonical path (catching a symlink ancestor swapped after the tool resolved the target) and the mutation delegates with that fresh target, never the stale one.
- Extends `LocalFileSystem`; only the two mutations get a per-call policy fence, reads pass through. The fence is a policy check in trusted code over a model-controlled path, not a kernel boundary (kernel isolation of untrusted code is `ctx.shell` job); the residual ancestor-symlink TOCTOU is narrowed by re-canonicalizing immediately before delegating and is accepted. Loading it instead of `freddie-fs-local` plus a `ctx.sandboxPolicy` is the whole swap.
- Modes: `read-only` denies every mutation; `workspace-write` allows a target under the policy workspace root or a platform temp area (same `writableRoots` set Seatbelt grants, so bash and fs cannot drift); `danger-full-access` delegates unfenced. Denial throws `FS_SANDBOX_DENIED`; the escalation retry lives in `freddie-tool-fs`.
- Containment: canonical spellings take the lexical fast path; differing spellings (Windows 8.3 names, casing) fall back to comparing filesystem identity of the target existing ancestors against the root.
