const tails = new WeakMap()

export async function runScheduleTransaction(agent, operation) {
  const prior = tails.get(agent) ?? Promise.resolve()
  const run = prior.then(operation)
  const tail = run.then(() => undefined, () => undefined)
  tails.set(agent, tail)
  try {
    return await run
  } finally {
    if (tails.get(agent) === tail) tails.delete(agent)
  }
}
