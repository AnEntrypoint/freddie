/**
 * Host-side vocabulary of the goal domain: live views, durable change
 * payloads, message attribution, replay folds, and the scoped `goal/changed`
 * event. Kept separate from ./types.js (the pure client-safe outlet) because
 * these declarations pull freddie-agent, freddie-llm, and cordis into the program —
 * the one-program-per-side layout forbids that on client aggregates.
 * @module @freddie/freddie-goal
 */
