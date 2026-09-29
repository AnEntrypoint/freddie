/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-host-product-telemetry-otel'

export const name = 'host-product-telemetry-otel-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
