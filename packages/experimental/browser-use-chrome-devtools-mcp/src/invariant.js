/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-experimental-browser-use-chrome-devtools-mcp'

/** Cordis companion plugin name. */
export const name = 'browser-use-chrome-devtools-mcp-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider holds no durable record and publishes no
 * independent connection observation. Its owned MCP generations, tool
 * registrations, and catalog are checked by `@freddie/freddie-mcp-client` and
 * `@freddie/freddie-tools`.
 */
const install = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
