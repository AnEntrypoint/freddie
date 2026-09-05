/**
 * Public agent types and live-runtime events. Durable transcript facts and
 * turn/step boundaries remain `@freddie/freddie-session` events.
 *
 * This module is intentionally empty at runtime: in the TypeScript source it
 * carried only compile-time constructs (the `Agent`/`AgentOptions`/
 * `CancelOptions`/etc. interfaces and type aliases, plus `declare module`
 * augmentations of `@freddie/freddie-system-prompt`'s `AssembleContext` and
 * `@freddie/cordis`'s `Events`), none of which have a JavaScript
 * representation. The event vocabulary they documented
 * (`agent/created`, `agent/disposed`, `agent/status`, `agent/inbox/*`,
 * `agent/session-start`, `agent/pre-step`, `agent/request`,
 * `agent/request-error`, `agent/turn-stopping`, `agent/error`) is emitted at
 * runtime by the agent-loop implementation, not by this package.
 *
 * @module @freddie/freddie-agent
 */
export {}
