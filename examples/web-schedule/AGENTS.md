# AGENTS.md — web-schedule example

## Rationale

- `cordis.yml` inserts the Schedule rows over the shipped Web composition; the schedule owner observes only roots published after this overlay loads.
- The overlay no longer inserts `time-context`: the Web `standard`, `code` and `cordis` presets mount it by default, and inserting a second `time-context` row fails the boot with `duplicate loader entry id`. The shipped row uses `refreshIntervalMs: 60000`; a deployment that wants a reading at every step copies the preset and drops `refreshIntervalMs` from its row.
