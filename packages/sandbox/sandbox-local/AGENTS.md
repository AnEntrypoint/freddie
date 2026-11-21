# AGENTS.md — sandbox-local

## Rationale

- `src/index.js` `static Config` is an inline schema call because the config catalog walks `static Config` statically. The schema defaults every field; an empty `runnerCommand` means "not configured, use the platform chain", and `runnerFailureSignatures` without `runnerCommand` throws.
- `src/index.js` runner selection (fail-closed): a sole candidate (darwin `seatbelt`) is selected without a probe. With several candidates the first probe not `unusable` wins.
- `src/index.js` claimed enforcement (`STATIC_ENFORCEMENT` and probe results): bwrap's mount profile and Seatbelt's deny-file-write* profile govern every promised file effect by construction, so passing probes are `full`; the Landlock launcher's probe distinguishes full from per-ABI-partial.
- Runner selection is by platform first, probes second: chains are probed in preference order only with more than one candidate (Linux bwrap then Landlock; darwin Seatbelt is single). A probe bound of 0 would mean unbounded in Node `spawnSync`, so it must be positive and finite. Denial signatures are case-insensitive stderr substrings; runner-failure rules are exit-gated (Landlock exits 125) so a confined command that merely prints the signature is not misclassified.
