## Rationale

- `src/index.js` `open`: the `opening` slot is reserved synchronously at entry (the body runs synchronously to its first await) so a concurrent open of the same unit fails and `close()` can await in-flight opens. If the backend closed while an open was in flight, the new unit is closed rather than handed out past `close()`.
- `src/unit.js` `put` rollback: memory is authoritative, so a rejected publish restores the previous value (or removes the key) instead of letting the failed write survive in memory or ride along with the next publish.
- `src/unit.js` write tracking: the tracking branch swallows rejections (`write.catch(() => {})`) but the caller still awaits `write` itself, so each rejection is observed exactly once.
