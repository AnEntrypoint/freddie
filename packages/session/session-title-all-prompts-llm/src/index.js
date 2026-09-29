/** All-human-messages model provider for `ctx.sessionTitle`. */

import z from '@freddie/schemastery'
import {
  registerSessionTitleLlmProvider,
  SessionTitleLlmConfigFields,
} from '@freddie/freddie-session-title-llm'

export const name = 'session-title-all-prompts-llm'
export const inject = ['sessionTitle', 'llm', 'sessions']

/**
 * Loader schema shared with the first-prompt provider.
 * @name Config
 */
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

/**
 * Register the all-prompts model provider.
 * @param ctx - context exposing session-title, LLM, and session services.
 * @param config - required route, target, byte, token, and timeout policy.
 */
export function apply(ctx, config) {
  registerSessionTitleLlmProvider(ctx, config, name, 'all-prompts', messages => messages)
}
