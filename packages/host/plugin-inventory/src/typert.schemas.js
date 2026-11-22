import { z } from 'zod'

export const _deepseek_ai_dsh_host_plugin_inventory_pluginInventory_list_result$schema = z.object({
  'entries': z.array(z.object({
  'entryId': z.intersection(z.string(), z.unknown()).readonly(),
  'moduleName': z.string().readonly(),
  'enabled': z.boolean().readonly(),
  'fiberPhase': z.union([z.literal(null), z.literal("failed"), z.literal("pending"), z.literal("active"), z.literal("loading"), z.literal("unloading")]).readonly(),
})).readonly(),
})
