import { estimateMessagesTokens } from './compress/tokens.js'

// estimateMessagesTokensWithActual: use the provider-reported count when a
// prior LLM response supplied one, else the character-based estimate.
function estimateMessagesTokensWithActual(messages, actualTokenCount) {
  return Number.isFinite(actualTokenCount) ? actualTokenCount : estimateMessagesTokens(messages)
}

/**
 * Compute dynamic max_completion_tokens for a single LLM call.
 * Matches kimi's behavior: max_context_size - estimated_input - safety_margin,
 * capped by reserved_context_size.
 *
 * Pure computation — no filesystem or Node APIs. Token estimation is
 * character-based via estimateMessagesTokensWithActual. Callers are
 * responsible for passing config values (maxContextSize, reservedSize);
 * sensible defaults are applied when omitted.
 *
 * @param {Array} messages - Array of message objects
 * @param {Object} opts
 * @param {number} [opts.maxContextSize=200000] - Model's max context window
 * @param {number} [opts.reservedSize=50000] - Cap for completion tokens
 * @param {number} [opts.safetyMargin=1000] - Safety margin (matches kimi)
 * @param {number|null} [opts.actualTokenCount=null] - Known token count from prior LLM usage
 * @returns {{budget: number, maxContextSize: number, estimatedInput: number, reservedSize: number, safetyMargin: number, rawBudget: number, isConstrained: boolean}}
 */
export function computeCompletionBudget(messages, {
  maxContextSize = 200000,
  reservedSize = 50000,
  safetyMargin = 1000,
  actualTokenCount = null,
} = {}) {
  const estimatedInput = estimateMessagesTokensWithActual(messages, actualTokenCount)

  // Budget = what's left after input, minus safety margin
  const rawBudget = maxContextSize - estimatedInput - safetyMargin

  // Cap at reserved_context_size
  const budget = Math.max(0, Math.min(rawBudget, reservedSize))

  return {
    budget,
    maxContextSize,
    estimatedInput,
    reservedSize,
    safetyMargin,
    rawBudget,
    isConstrained: rawBudget < reservedSize,
  }
}