import { _deepseek_ai_dsh_host_plugin_inventory_pluginInventory_list_result$schema } from './typert.schemas.js'

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
