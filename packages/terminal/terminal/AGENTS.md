## Rationale

- `src/index.js` observer notification swallows observer errors: observers cannot interrupt registry lifecycle or terminal mechanics.
- `src/index.js` dispose: teardown is best-effort; a close failure still clears registries and runs owner cleanups before the aggregated error propagates, so one stuck session cannot orphan backends, reservations, or owner detachers.
- `src/index.js` close fence: on failure `record.closing` is cleared only if it still equals this attempt's fence, because a concurrent retry may already own a newer one.
