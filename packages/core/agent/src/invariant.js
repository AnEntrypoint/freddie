const PACKAGE_NAME = '@freddie/freddie-agent'

export const name = 'agent-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  const lastStatus = new WeakMap()
  ctx.on('agent/status', ({ agent, status }) => {
    const previous = lastStatus.get(agent)
    if (previous === status) {
      fail(`agent/status repeated ${status} (no-op transition)`)
    }
    lastStatus.set(agent, status)
  }, { global: true })
}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
