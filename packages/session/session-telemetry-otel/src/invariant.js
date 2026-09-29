/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-session-telemetry-otel'

export const name = 'session-telemetry-otel-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
