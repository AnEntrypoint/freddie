## Rationale

- `src/domain.js` dispose: chain links never reject (each settles via `then(noop, noop)`), so `await this.chain` is a pure drain barrier before the unit closes.
- `src/domain.js` `domain/changed` emit: only synchronous observer exceptions are swallowed (emit dispatches listeners inline and nothing else runs in the `try`); the event is a notification, not a transaction participant, and the commit point has passed, so containment with a log is the only correct outcome.
- `src/domain.js` `delete`: existence is decided at the job's chain slot, not at call time, so an earlier queued put of the same key is observed.
- `src/index.js` open: a null stored global means "never written"; `initial` is served without materializing it and the first `set` writes. The reservation on `spec.name` is released unconditionally on any failure because nothing can throw after the domain registers.
- `src/index.js` `onClosed` runs strictly after teardown: writes landing during the drain still emit `domain/changed` and the domain stays resolvable (the package invariant cross-checks each event) until fully closed, only then does the name free up for reopening. For the same reason facility teardown calls `closeAll()` before unmounting.
