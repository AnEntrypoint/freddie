const PACKAGE_NAME = '@freddie/freddie-session-telemetry'

export const name = 'session-telemetry-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
