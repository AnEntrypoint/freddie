# @freddie/freddie-goal-round-driver

## Rationale

- A throwing downstream hook drops the whole step proposal: `state.attempt` is cleared and a drive is requested before rethrowing, so the balanced no-step turn returns to idle and the next pass can reschedule the round.
- Loading the driver over existing agents disarms every agent state: no hidden automatic authority is inherited from an earlier producer instance.
- The teardown `yield` comes after listener registration so its close runs first and the composite effect removes listeners only after that promise settles.
- `index.js` mirrors Cordis’s runtime `FiberState` values; keep those numeric values synchronized with `framework/cordis/src/fiber.js`.
