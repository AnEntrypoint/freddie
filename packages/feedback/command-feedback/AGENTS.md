# @freddie/freddie-command-feedback

## Rationale

- Recording appends one authoritative log-only `feedback/record` event and starts no model work; the append is eager but unflushed, so the acknowledgement says the entry is logged, not that it reached disk. An error result leaves no event.
- The sharing sentence reads the optional telemetry service through the plugin context, so `/feedback` works when telemetry is absent; an unknown future sharing status fails closed at the sentence switch.
