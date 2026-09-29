
/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-attachment-local'
export const name = 'attachment-local-invariant'
export const inject = ['invariants', 'attachments']
const install = () => {}
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
