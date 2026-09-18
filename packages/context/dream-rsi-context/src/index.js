import z from '@freddie/schemastery'
import { createUserMessage } from '@freddie/freddie-llm'

export const name = 'dream-rsi-context'
export const inject = ['agents']

export const Config = z.object({
  enabled: z.boolean().default(true),
  maxObservedNodes: z.number().step(1).min(1).default(16),
})

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function opaqueId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]+$/.test(value) ? value : undefined
}

function validSelection(value) {
  const result = record(value)?.data ?? record(value)
  const baselinePolicyId = opaqueId(result?.baseline_policy_id)
  const selectedPolicyId = opaqueId(result?.selected_policy_id)
  if (result?.ok !== true || baselinePolicyId === undefined
    || selectedPolicyId === undefined || !Array.isArray(result.rankings)) return undefined
  const selected = result.rankings.find(entry => opaqueId(record(entry)?.policy_id) === selectedPolicyId)
  const baseline = result.rankings.find(entry => opaqueId(record(entry)?.policy_id) === baselinePolicyId)
  if (record(selected) === undefined || record(baseline) === undefined) return undefined
  const selectedScore = selected.score
  const baselineScore = baseline.score
  if (typeof selectedScore !== 'number' || !Number.isFinite(selectedScore)
    || typeof baselineScore !== 'number' || !Number.isFinite(baselineScore)
    || selectedScore < baselineScore) return undefined
  const replays = selected.replays
  if (!Array.isArray(replays) || replays.length === 0 || replays.some(replay => !Array.isArray(record(replay)?.observed_node_ids)
    || record(replay).observed_node_ids.some(node => opaqueId(node) === undefined))) return undefined
  return { result, selected, baseline }
}

function latestReplay(agent) {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type !== 'tool/result') continue
    const call = agent.session.events.find(candidate => candidate.seq === event.sourceEventSeqs?.[0])
    if (call?.type !== 'tool/call' || call.data.name !== 'gm_dream_replay') continue
    const receipt = record(event.data.meta)?.dreamReplay
    if (!Array.isArray(receipt?.worldIds) || !Array.isArray(receipt?.policyIds)
      || receipt.baselinePolicyId !== call.data.arguments?.baseline_policy_id
      || JSON.stringify(receipt.worldIds) !== JSON.stringify(call.data.arguments?.world_ids)
      || JSON.stringify(receipt.policyIds) !== JSON.stringify(call.data.arguments?.policy_ids)) continue
    const block = event.data.message.content.find(candidate => candidate.type === 'tool-result')
    const text = block?.content.find(candidate => candidate.type === 'text')?.text
    if (typeof text !== 'string') continue
    try {
      const selection = validSelection(JSON.parse(text))
      const replayWorldIds = selection?.selected.replays.map(replay => replay.world_id)
      if (selection === undefined || selection.result.baseline_policy_id !== receipt.baselinePolicyId
        || selection.result.selected_policy_id !== receipt.selectedPolicyId
        || JSON.stringify(replayWorldIds) !== JSON.stringify(receipt.worldIds)) continue
      return selection
    } catch {
      return undefined
    }
  }
  return undefined
}

function renderDirective(selection, maxObservedNodes) {
  const observed = selection.selected.replays.flatMap(replay => replay.observed_node_ids)
  const limited = [...new Set(observed)].slice(0, maxObservedNodes)
  return `<dream-rsi-directive>\nReplay-selected exploration policy: ${selection.result.selected_policy_id}.\nBaseline policy: ${selection.result.baseline_policy_id}; replay score: ${selection.selected.score}; baseline score: ${selection.baseline.score}.\nGrounding boundary: choose only from the recorded replay evidence; do not claim that unobserved branches, tool results, or evaluator outcomes were simulated.\nObserved replay nodes: ${limited.join(', ')}.\n</dream-rsi-directive>`
}

function latestAutomaticStrategy(agent) {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type !== 'gm/dream-rsi') continue
    const strategy = record(event.data.strategy)
    const replay = record(event.data.replay)
    if (strategy === undefined || replay === undefined
      || !Array.isArray(strategy.evidence) || !Array.isArray(replay.replays)
      || typeof strategy.selection !== 'string') continue
    return { strategy, replay }
  }
  return undefined
}

function renderAutomaticStrategy(automatic, maxObservedNodes) {
  const evidence = automatic.strategy.evidence.slice(0, maxObservedNodes)
  const nodes = evidence.map(entry => opaqueId(record(entry)?.dispatch_id)).filter(Boolean)
  return `<dream-rsi-strategy>\nGM automatic exploration strategy: ${automatic.strategy.selection}.\nObserved dispatches: ${nodes.join(', ')}.\nGrounding boundary: this strategy summarizes GM ledger evidence; it does not prove an unobserved target outcome.\n</dream-rsi-strategy>`
}

export function apply(ctx, config) {
  const maxObservedNodes = config.maxObservedNodes
  if (!config.enabled) return
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const selection = latestReplay(agent)
    if (selection !== undefined) {
      const text = renderDirective(selection, maxObservedNodes)
      return {
        kind: 'enter',
        messages: [...decision.messages, createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'grounded-replay', sections: [{ name, text }] },
        })],
      }
    }
    const automatic = latestAutomaticStrategy(agent)
    if (automatic === undefined) return decision
    const text = renderAutomaticStrategy(automatic, maxObservedNodes)
    return {
      kind: 'enter',
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: name, form: 'automatic-strategy', sections: [{ name, text }] },
      })],
    }
  }, { prepend: true })
}
