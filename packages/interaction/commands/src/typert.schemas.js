import { z } from 'zod'

export const _deepseek_ai_dsh_commands_commands_execute_parameter_0$schema = z.intersection(z.string(), z.unknown())
export const _deepseek_ai_dsh_commands_commands_execute_parameter_1$schema = z.string()
export const _deepseek_ai_dsh_commands_commands_execute_parameter_2$schema = z.array(z.object({
  'mediaType': z.union([z.literal("image/png"), z.literal("image/jpeg"), z.literal("image/webp"), z.literal("image/gif")]),
  'data': z.string(),
  'name': z.string().optional(),
}))
export const _deepseek_ai_dsh_commands_commands_execute_result$schema = z.union([z.undefined(), z.object({
  'commandId': z.intersection(z.string(), z.unknown()).readonly(),
  'result': z.union([z.object({
  'kind': z.literal("success").readonly(),
  'text': z.string().readonly().optional(),
  'sourceEventSeq': z.number().readonly().optional(),
}), z.object({
  'kind': z.literal("error").readonly(),
  'text': z.string().readonly(),
})]).readonly(),
})])
export const _deepseek_ai_dsh_commands_commands_list_result$schema = z.array(z.object({
  'name': z.string().readonly(),
  'description': z.string().readonly(),
  'input': z.object({
  'hint': z.string().readonly(),
  'images': z.boolean().readonly().optional(),
}).readonly().optional(),
}))
