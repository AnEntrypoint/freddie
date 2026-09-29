
import { deepFreeze } from '@freddie/freddie-llm'

export const PRUNE_MARKER = '\n\n[... tool result middle pruned ...]\n\n'

export const DEFAULTS = deepFreeze({
  thresholdChars: 8192,
  headChars: 4096,
  tailChars: 1024,
})

const CONFIG_KEYS = new Set([
  'thresholdChars',
  'headChars',
  'tailChars',
])

export function codePointLength(text) {
  return Array.from(text).length
}

export function resolveConfig(config = {}) {
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new Error(
        `ToolResultPruneConfig: unknown key "${key}" `
        + '(allowed: thresholdChars, headChars, tailChars)',
      )
    }
  }

  const resolved = {
    thresholdChars: config.thresholdChars ?? DEFAULTS.thresholdChars,
    headChars: config.headChars ?? DEFAULTS.headChars,
    tailChars: config.tailChars ?? DEFAULTS.tailChars,
  }
  assertPositiveInteger('thresholdChars', resolved.thresholdChars)
  assertNonNegativeInteger('headChars', resolved.headChars)
  assertNonNegativeInteger('tailChars', resolved.tailChars)

  const emittedChars = resolved.headChars
    + codePointLength(PRUNE_MARKER)
    + resolved.tailChars
  if (emittedChars > resolved.thresholdChars) {
    throw new Error(
      `ToolResultPruneConfig: headChars + marker + tailChars (${emittedChars}) `
      + `must be at most thresholdChars (${resolved.thresholdChars})`,
    )
  }
  return deepFreeze(structuredClone(resolved))
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`ToolResultPruneConfig: ${name} (${value}) must be a positive integer`)
  }
}

function assertNonNegativeInteger(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`ToolResultPruneConfig: ${name} (${value}) must be a non-negative integer`)
  }
}
