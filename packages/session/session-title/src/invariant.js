/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-session-title'

export const name = 'session-title-invariant'
export const inject = ['invariants']

const install = Object.assign((ctx, fail) => {
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [, event] = args
    if (event.type !== 'session/title') return
    const { source, messageSeqs } = event.data
    if ((messageSeqs.length === 0) !== (source.kind === 'user')) {
      const requirement = source.kind === 'user' ? 'cite no message seqs' : 'cite at least one message seq'
      fail(`session/title event ${String(event.seq)} with source "${source.kind}" must ${requirement}; got ${String(messageSeqs.length)}`)
    }
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
