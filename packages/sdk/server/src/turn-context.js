/**
 * Per-agent opaque context a deployer's own tool package reads by the live
 * `Agent` object — the same "module-owned `WeakMap` keyed by `Agent`" idiom
 * `freddie-host-apiproxy`'s `selectionFor` uses for its own per-agent state
 * (there is no general-purpose `agent.ctx` service for arbitrary caller data;
 * `session.header` is a closed schema that silently drops unknown fields).
 *
 * @module @freddie/freddie-sdk-jsonrpc-server/turn-context
 */

const turnContexts = new WeakMap()

/**
 * Replace the turn context for one agent. Called by {@link HarnessSdkJsonRpcServer#prompt}
 * when the incoming `session/prompt` carries a `turnContext` value; a call
 * carrying none leaves the agent's existing context (or absence of one)
 * unchanged, so a deployer that sets it once at session creation does not
 * need to repeat it on every later turn.
 * @param agent - the live agent this context applies to.
 * @param value - the deployer-defined opaque context (e.g. casey's
 *   `{ author, role, tier, store }`).
 */
export function setTurnContext(agent, value) {
  turnContexts.set(agent, value)
}

/**
 * Read the current turn context for one agent, as set by the most recent
 * {@link setTurnContext} call for it (across the session's whole lifetime,
 * not just the in-flight turn).
 * @param agent - the agent a tool's `execute(args, exec)` received as `exec.agent`.
 * @returns the deployer-defined context, or `undefined` if none was ever set.
 */
export function turnContextFor(agent) {
  return turnContexts.get(agent)
}
