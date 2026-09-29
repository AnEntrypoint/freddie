function usageOutputTokens(usage) {
  if (typeof usage !== 'object' || usage === null) return null
  const value = usage.outputTokens
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function assistantStepReading(node) {
  const timing = node.timing
  const ttftMs = timing !== undefined && timing.stepStartTime !== null && timing.firstTokenTime !== null
    ? Math.max(0, timing.firstTokenTime - timing.stepStartTime)
    : null
  const decodeMs = timing !== undefined && timing.firstTokenTime !== null
    ? Math.max(0, timing.completedTime - timing.firstTokenTime)
    : null
  return { ttftMs, decodeMs, outputTokens: usageOutputTokens(node.usage) }
}

export function deriveTurnMetrics(nodes) {
  const folds = new Map()
  for (const node of nodes) {
    if (node.kind !== 'assistant') continue
    const reading = assistantStepReading(node)
    let fold = folds.get(node.turn)
    if (fold === undefined) {
      fold = { firstStep: node.step, firstStepTtftMs: reading.ttftMs, decodeMs: 0, outputTokens: 0, sampled: false }
      folds.set(node.turn, fold)
    } else if (node.step < fold.firstStep) {
      fold.firstStep = node.step
      fold.firstStepTtftMs = reading.ttftMs
    }
    if (reading.decodeMs !== null && reading.outputTokens !== null) {
      fold.decodeMs += reading.decodeMs
      fold.outputTokens += reading.outputTokens
      fold.sampled = true
    }
  }
  const metrics = new Map()
  for (const [turn, fold] of folds) {
    const entry = {}
    if (fold.firstStepTtftMs !== null) entry.ttftMs = fold.firstStepTtftMs
    if (fold.sampled && fold.decodeMs > 0) entry.tokensPerSecond = fold.outputTokens / (fold.decodeMs / 1000)
    if (entry.ttftMs !== undefined || entry.tokensPerSecond !== undefined) metrics.set(turn, entry)
  }
  return metrics
}
