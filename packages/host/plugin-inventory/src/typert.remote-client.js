/** Hand-owned Typert Remote-client manifest for this package's Host RPC surface. */
import { z } from 'zod'

const _deepseek_ai_dsh_host_plugin_inventory_pluginInventory_list_result$schema = z.object({
  'entries': z.array(z.object({
  'entryId': z.intersection(z.string(), z.unknown()).readonly(),
  'moduleName': z.string().readonly(),
  'enabled': z.boolean().readonly(),
  'fiberPhase': z.union([z.literal(null), z.literal("failed"), z.literal("pending"), z.literal("active"), z.literal("loading"), z.literal("unloading")]).readonly(),
})).readonly(),
})

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-host-plugin-inventory',
  descriptors: [
    {
      id: '@freddie/freddie-host-plugin-inventory#pluginInventory/list',
      service: 'pluginInventory',
      namespace: 'pluginInventory',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-host-plugin-inventory/types#PluginInventorySnapshot',
        schema: _deepseek_ai_dsh_host_plugin_inventory_pluginInventory_list_result$schema,
      },
      sourceLocation: {"file":"packages/host/plugin-inventory/src/index.ts","line":57,"column":3},
    },
  ],
}

export default TYPERT_REMOTE
