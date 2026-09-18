export const name = 'dream-rsi-context-invariant'
export const inject = ['invariants', 'sessions']

const PACKAGE_NAME = '@freddie/freddie-dream-rsi-context'
const SOURCE_NAME = 'dream-rsi-context'

const install = (ctx, fail) => {
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message' || event.data.source.kind !== 'plugin'
      || event.data.source.plugin !== SOURCE_NAME) return
    const source = event.data.source
    const block = event.data.content[0]
    if (event.data.content.length !== 1 || block?.type !== 'text'
      || source.sections?.[0]?.text !== block.text
      || !['grounded-replay', 'automatic-strategy'].includes(source.form)) {
      fail('dream-rsi-context must append one sourced Dream-RSI text message')
    }
    if (source.form === 'automatic-strategy') {
      if (!block.text.startsWith('<dream-rsi-strategy>')) fail('automatic Dream-RSI strategy must retain its grounded strategy boundary')
      return
    }
    const position = session.events.findIndex(candidate => candidate === event)
    const prior = session.events.slice(0, position).findLast(candidate => {
      if (candidate.type !== 'tool/result') return false
      const call = session.events.find(entry => entry.seq === candidate.sourceEventSeqs?.[0])
      const receipt = candidate.data.meta?.dreamReplay
      return call?.type === 'tool/call' && call.data.name === 'gm_dream_replay'
        && receipt?.baselinePolicyId === call.data.arguments?.baseline_policy_id
        && JSON.stringify(receipt?.worldIds) === JSON.stringify(call.data.arguments?.world_ids)
        && JSON.stringify(receipt?.policyIds) === JSON.stringify(call.data.arguments?.policy_ids)
    })
    if (prior === undefined) fail('dream-rsi-context requires a preceding receipt-bound gm_dream_replay result')
  })
}

export const apply = ctx => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
