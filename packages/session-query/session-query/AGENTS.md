# AGENTS.md — session-query

## Rationale

- `src/extraction.js`: `SessionEventMap`, `TurnEndReasonMap` and `ContentBlockMap` are merge-extensible, so unknown events, turn-end outcomes and content blocks yield no searchable text until a concrete first-party consumer defines their semantics (a payload merely containing strings does not make a block searchable).
- A known live target never consults persistence, so an optional backend failure cannot make in-memory history unreadable.
