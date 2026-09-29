import z from '@freddie/schemastery'
import {
  registerSessionTitleLlmProvider,
  SessionTitleLlmConfigFields,
} from '@freddie/freddie-session-title-llm'

export const name = 'session-title-all-prompts-llm'
export const inject = ['sessionTitle', 'llm', 'sessions']

/* jscpd:ignore-start */
export const Config = z.object({
  targetWords: SessionTitleLlmConfigFields.targetWords,
  maxInputBytes: SessionTitleLlmConfigFields.maxInputBytes,
  maxOutputTokens: SessionTitleLlmConfigFields.maxOutputTokens,
  timeoutMs: SessionTitleLlmConfigFields.timeoutMs,
  provider: SessionTitleLlmConfigFields.provider,
  model: SessionTitleLlmConfigFields.model,
})
/* jscpd:ignore-end */

export function apply(ctx, config) {
  registerSessionTitleLlmProvider(ctx, config, name, 'all-prompts', messages => messages)
}
