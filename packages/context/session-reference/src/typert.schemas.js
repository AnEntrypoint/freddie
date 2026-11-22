import { z } from 'zod'

export const _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_parameter_0$schema = z.intersection(z.string(), z.unknown())
export const _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_parameter_1$schema = z.string()
export const _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_result$schema = z.array(z.object({
  'mention': z.string(),
  'sessionId': z.intersection(z.string(), z.unknown()),
  'label': z.string(),
  'cwd': z.string().optional(),
  'createdAt': z.number(),
}))
