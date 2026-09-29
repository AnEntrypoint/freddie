import z from '@freddie/schemastery'
import { MAX_TIMER_DELAY_MS } from '@freddie/freddie-timeout'
import { GLOB_MAX_RESULTS, applyGlobTool } from './glob.js'
import { GREP_MAX_LINE_BYTES, GREP_MAX_MATCHES, applyGrepTool } from './grep.js'
import { RAW_OUTPUT_MAX_BYTES, SEARCH_GRACE_MS, SEARCH_META_MAX_BYTES, SEARCH_STDERR_MAX_BYTES, SEARCH_TIMEOUT_MS } from './search-core.js'

export { GLOB_MAX_RESULTS, GLOB_VCS_EXCLUDES, applyGlobTool, buildGlobCommand, formatGlobOutput, parseGlobArgs, presentGlobCall, presentGlobResult, sampleAcrossTopLevel } from './glob.js'
export {
  GREP_MAX_LINE_BYTES,
  GREP_MAX_MATCHES,
  applyGrepTool,
  buildGrepCommand,
  formatGrepMatches,
  formatGrepOutput,
  parseGrepArgs,
  parseGrepMatches,
  presentGrepCall,
  presentGrepResult,
} from './grep.js'
export {
  RAW_OUTPUT_MAX_BYTES,
  SEARCH_GRACE_MS,
  SEARCH_META_MAX_BYTES,
  SEARCH_STDERR_MAX_BYTES,
  SEARCH_TIMEOUT_MS,
  SearchError,
  previewLine,
  resolveRgPath,
  runRipgrep,
  toWorkdirRelative,
  trySaveFormattedResult,
} from './search-core.js'

export const name = 'tool-fs-search'

export const inject = ['tools', 'systemPrompt', 'subprocess']


export const Config = z.object({
  sampleOverCapGlobResults: z.boolean().required(),
  globMaxResults: z.number().default(GLOB_MAX_RESULTS),
  grepMaxMatches: z.number().default(GREP_MAX_MATCHES),
  grepMaxLineBytes: z.number().default(GREP_MAX_LINE_BYTES),
  searchMetaMaxBytes: z.number().default(SEARCH_META_MAX_BYTES),
  rawOutputMaxBytes: z.number().default(RAW_OUTPUT_MAX_BYTES),
  graceMs: z.number().default(SEARCH_GRACE_MS),
  stderrMaxBytes: z.number().default(SEARCH_STDERR_MAX_BYTES),
  timeoutMs: z.number().default(SEARCH_TIMEOUT_MS),
})


function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-fs-search: ${name} must be a positive integer`)
  }
}

// oxlint-disable-next-line typescript/require-await -- async keeps a load-time config rejection a rejection, not a synchronous throw
export async function apply(ctx, config) {
  const resolved = config
  assertPositiveInteger('globMaxResults', resolved.globMaxResults)
  assertPositiveInteger('grepMaxMatches', resolved.grepMaxMatches)
  assertPositiveInteger('grepMaxLineBytes', resolved.grepMaxLineBytes)
  assertPositiveInteger('searchMetaMaxBytes', resolved.searchMetaMaxBytes)
  assertPositiveInteger('rawOutputMaxBytes', resolved.rawOutputMaxBytes)
  assertPositiveInteger('graceMs', resolved.graceMs)
  if (resolved.graceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`tool-fs-search: graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  assertPositiveInteger('stderrMaxBytes', resolved.stderrMaxBytes)
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  applyGlobTool(ctx, {
    sampleOverCapGlobResults: resolved.sampleOverCapGlobResults,
    maxResults: resolved.globMaxResults,
    maxMetaBytes: resolved.searchMetaMaxBytes,
    rawOutputMaxBytes: resolved.rawOutputMaxBytes,
    graceMs: resolved.graceMs,
    stderrMaxBytes: resolved.stderrMaxBytes,
    timeoutMs: resolved.timeoutMs,
  })
  applyGrepTool(ctx, {
    maxMatches: resolved.grepMaxMatches,
    maxLineBytes: resolved.grepMaxLineBytes,
    maxMetaBytes: resolved.searchMetaMaxBytes,
    rawOutputMaxBytes: resolved.rawOutputMaxBytes,
    graceMs: resolved.graceMs,
    stderrMaxBytes: resolved.stderrMaxBytes,
    timeoutMs: resolved.timeoutMs,
  })
}
