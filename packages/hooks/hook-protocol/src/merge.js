function rank(decision) {
  switch (decision) {
    case 'deny': case 'block': return 3
    case 'ask': return 2
    case 'approve': case 'allow': return 1
    default: return 0
  }
}

function decisionForRank(maxRank) {
  switch (maxRank) {
    case 3: return 'deny'
    case 2: return 'ask'
    case 1: return 'allow'
    default: return 'none'
  }
}

export function mergeHookOutputs(outputs) {
  let maxRank = 0
  const reasonsByRank = new Map()
  let stop = false
  let stopReason
  const additionalContext = []
  const systemMessages = []

  for (const out of outputs) {
    const r = rank(out.decision)
    if (r > maxRank) maxRank = r
    if ((r === 3 || r === 2) && out.reason !== undefined && out.reason.length > 0) {
      const list = reasonsByRank.get(r) ?? []
      list.push(out.reason)
      reasonsByRank.set(r, list)
    }
    if (out.continue === false && !stop) {
      stop = true
      if (out.stopReason !== undefined) stopReason = out.stopReason
    }
    if (out.additionalContext !== undefined && out.additionalContext.length > 0) {
      additionalContext.push(out.additionalContext)
    }
    if (out.systemMessage !== undefined && out.systemMessage.length > 0) {
      systemMessages.push(out.systemMessage)
    }
  }

  const reasons = reasonsByRank.get(maxRank) ?? []
  return {
    decision: decisionForRank(maxRank),
    ...reasons.length > 0 ? { reason: reasons.join('\n\n') } : {},
    stop,
    ...stopReason !== undefined ? { stopReason } : {},
    additionalContext,
    systemMessages,
  }
}
