import { z } from 'zod'

export const _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema = z.intersection(z.string(), z.unknown())
export const _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema = z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'revision': z.number().readonly(),
})
export const _deepseek_ai_dsh_goal_goals_complete_result$schema = z.object({
  'roundsStarted': z.number().readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
  'activation': z.union([z.literal("armed"), z.literal("disarmed")]).readonly(),
  'objective': z.string().readonly(),
  'phase': z.union([z.literal("active"), z.literal("paused"), z.literal("blocked"), z.literal("complete")]).readonly(),
  'blockedReason': z.object({
  'code': z.string().readonly(),
  'message': z.string().readonly(),
}).readonly().optional(),
  'maxGoalRounds': z.number().readonly(),
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'revision': z.number().readonly(),
})
export const _deepseek_ai_dsh_goal_goals_create_parameter_1$schema = z.object({
  'objective': z.string().readonly(),
  'maxGoalRounds': z.number().readonly().optional(),
})
export const _deepseek_ai_dsh_goal_goals_create_result$schema = z.object({
  'ref': z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'revision': z.number().readonly(),
}).readonly(),
})
export const _deepseek_ai_dsh_goal_goals_edit_parameter_2$schema = z.object({
  'objective': z.string().readonly().optional(),
  'maxGoalRounds': z.number().readonly().optional(),
})
