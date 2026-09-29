const AGENT_LOOP_REQUESTS = new WeakSet()

export function callConfigEquals(a, b) {
  if (
    a.provider !== b.provider
    || a.model !== b.model
    || a.reasoningEffort !== b.reasoningEffort
    || a.temperature !== b.temperature
    || a.maxTokens !== b.maxTokens
  ) return false
  if (a.stop === undefined || b.stop === undefined) return a.stop === b.stop
  return a.stop.length === b.stop.length && a.stop.every((s, i) => s === b.stop?.[i])
}

export function markAgentLoopRequest(request) {
  AGENT_LOOP_REQUESTS.add(request)
  return request
}

export function isAgentLoopRequest(request) {
  return AGENT_LOOP_REQUESTS.has(request)
}

export { deepFreeze } from '@freddie/freddie-values'
