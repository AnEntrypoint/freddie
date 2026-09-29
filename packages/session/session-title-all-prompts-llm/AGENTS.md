# AGENTS.md — session-title-all-prompts-llm

## Rationale

- `Config`: each title provider package exports its own `Config` object literal (this one and `session-title-first-prompt-llm` repeat the same field list, hence the `jscpd:ignore` region) while the validators stay shared in `SessionTitleLlmConfigFields`. Stated reason, carried over from the removed comment and not independently verified: the loader requires each plugin to export its own statically walkable schema.
