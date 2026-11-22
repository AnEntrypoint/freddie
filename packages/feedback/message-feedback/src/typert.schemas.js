import { z } from 'zod'

export const _deepseek_ai_dsh_message_feedback_messageFeedback_delete_parameter_0$schema = z.object({
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
  'messageId': z.intersection(z.string(), z.unknown()).readonly(),
  'ifVersion': z.intersection(z.string(), z.unknown()).readonly(),
})
export const _deepseek_ai_dsh_message_feedback_messageFeedback_delete_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'absent': z.literal(true).readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.union([z.object({
  'code': z.literal("session-not-found").readonly(),
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
}), z.object({
  'code': z.literal("version-conflict").readonly(),
  'current': z.union([z.literal(null), z.object({
  'messageId': z.intersection(z.string(), z.unknown()).readonly(),
  'rating': z.union([z.literal("positive"), z.literal("negative")]).readonly(),
  'note': z.string().readonly().optional(),
  'version': z.intersection(z.string(), z.unknown()).readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
})]).readonly(),
})]).readonly(),
})])
export const _deepseek_ai_dsh_message_feedback_messageFeedback_list_parameter_0$schema = z.object({
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
})
export const _deepseek_ai_dsh_message_feedback_messageFeedback_list_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'items': z.array(z.object({
  'messageId': z.intersection(z.string(), z.unknown()).readonly(),
  'rating': z.union([z.literal("positive"), z.literal("negative")]).readonly(),
  'note': z.string().readonly().optional(),
  'version': z.intersection(z.string(), z.unknown()).readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
})).readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.object({
  'code': z.literal("session-not-found").readonly(),
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
}).readonly(),
})])
export const _deepseek_ai_dsh_message_feedback_messageFeedback_put_parameter_0$schema = z.object({
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
  'messageId': z.intersection(z.string(), z.unknown()).readonly(),
  'rating': z.union([z.literal("positive"), z.literal("negative")]).readonly(),
  'note': z.string().readonly().optional(),
  'ifVersion': z.union([z.literal(null), z.intersection(z.string(), z.unknown())]).readonly(),
})
export const _deepseek_ai_dsh_message_feedback_messageFeedback_put_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'messageId': z.intersection(z.string(), z.unknown()).readonly(),
  'rating': z.union([z.literal("positive"), z.literal("negative")]).readonly(),
  'note': z.string().readonly().optional(),
  'version': z.intersection(z.string(), z.unknown()).readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.union([z.object({
  'code': z.literal("session-not-found").readonly(),
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
}), z.object({
  'code': z.literal("target-not-found").readonly(),
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
  'messageId': z.intersection(z.string(), z.unknown()).readonly(),
}), z.object({
  'code': z.literal("version-conflict").readonly(),
  'current': z.union([z.literal(null), z.object({
  'messageId': z.intersection(z.string(), z.unknown()).readonly(),
  'rating': z.union([z.literal("positive"), z.literal("negative")]).readonly(),
  'note': z.string().readonly().optional(),
  'version': z.intersection(z.string(), z.unknown()).readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
})]).readonly(),
}), z.object({
  'code': z.literal("note-blank").readonly(),
}), z.object({
  'code': z.literal("note-too-large").readonly(),
  'maxBytes': z.number().readonly(),
  'actualBytes': z.number().readonly(),
})]).readonly(),
})])
