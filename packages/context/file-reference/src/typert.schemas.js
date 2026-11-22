import { z } from 'zod'

export const _deepseek_ai_dsh_file_reference_fileReferences_list_parameter_0$schema = z.intersection(z.string(), z.unknown())
export const _deepseek_ai_dsh_file_reference_fileReferences_list_parameter_1$schema = z.string()
export const _deepseek_ai_dsh_file_reference_fileReferences_list_result$schema = z.array(z.object({
  'path': z.string(),
  'kind': z.union([z.literal("file"), z.literal("directory")]),
}))
