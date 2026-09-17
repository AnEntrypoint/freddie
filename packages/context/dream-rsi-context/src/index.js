import z from '@freddie/schemastery'
import { createUserMessage } from '@freddie/freddie-llm'

export const name = 'dream-rsi-context'
export const inject = ['agents']

export const Config = z.object({
  maxObservedNodes: z.number().step(1).min(1).default(16),
})

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function validSelection(value) {
  const result = record(value)?.data ?? record(value)
  if (result?.ok !== true || typeof result.baseline_policy_id !== 'string'
    || typeof result.selected_policy_id !== 'string' || !Array.isArray(result.rankings)) return undefined
  const selected = result.rankings.find(entry => record(entry)?.policy_id === result.selected_policy_id)
  const baseline = result.rankings.find(entry => record(entry)?.policy_id === result.baseline_policy_id)
  if (record(selected) === undefined || record(baseline) === undefined) return undefined
  const selectedScore = selected.score
  const baselineScore = baseline.score
  if (typeof selectedScore !== 'number' || !Number.isFinite(selectedScore)
    || typeof baselineScore !== 'number' || !Number.isFinite(baselineScore)
    || selectedScore < baselineScore) return undefined
  const replays = selected.replays
  if (!Array.isArray(replays) || replays.length === 0 || replays.some(replay => !Array.isArray(record(replay)?.observed_node_ids))) return undefined
  return { result, selected, baseline }
}

function latestReplay(agent) {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type !== 'tool/result') continue
    const call = agent.session.events.find(candidate => candidate.seq === event.sourceEventSeqs?.[0])
    if (call?.type !== 'tool/call' || call.data.name !== 'gm_dream_replay') continue
    const block = event.data.message.content.find(candidate => candidate.type === 'tool-result')
    const text = block?.content.find(candidate => candidate.type === 'text')?.text
    if (typeof text !== 'string') continue
    try {
      return validSelection(JSON.parse(text))
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

export function apply(ctx, config) {
  const maxObservedNodes = config.maxObservedNodes
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const selection = latestReplay(agent)
    if (selection === undefined) return decision
    const text = renderDirective(selection, maxObservedNodes)
    return {
      kind: 'enter',
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: name, form: 'grounded-replay', sections: [{ name, text }] },
      })],
    }
  }, { prepend: true })
}
