# AGENTS.md — session-query

## Rationale

- `src/extraction.js`: `SessionEventMap`, `TurnEndReasonMap` and `ContentBlockMap` are merge-extensible, so unknown events, turn-end outcomes and content blocks yield no searchable text until a concrete first-party consumer defines their semantics (a payload merely containing strings does not make a block searchable).
- `src/tracing.js`: the indexed reads carry `oxlint-disable-next-line typescript/no-non-null-assertion` because the preceding target check, stack length guard and loop bounds prove the record, frame and node exist.
