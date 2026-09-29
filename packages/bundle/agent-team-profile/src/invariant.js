
const PACKAGE_NAME = '@freddie/freddie-agent-team-profile'

export const name = 'agent-team-profile-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
