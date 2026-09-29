/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-tool-str-replace-editor'

export const name = 'tool-str-replace-editor-invariant'
export const inject = ['invariants']

const install = () => {}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
