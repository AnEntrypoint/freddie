const turnContexts = new WeakMap()

export function setTurnContext(agent, value) {
  turnContexts.set(agent, value)
}

export function turnContextFor(agent) {
  return turnContexts.get(agent)
}
