/** Host plugin inventory registered into Web Settings, with an enable/disable switch per plugin. */

import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './PluginInventorySettingsTab.js'
import { en } from './locales.js'
import { createPluginManagerPort } from './plugin-manager-port.js'

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginInventory'

/** Services required by the Settings registration and generated Remote faces. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory', 'remote.pluginManager']

/** Contribute the lazy inventory tab to the Plugins settings section. */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-settings-plugin-inventory: dictionaries')

  const t = ctx.locale.bind(NS)
  const list = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const port = createPluginManagerPort(ctx.remote)
  const injected = () => ({ list, describe: port.describe, setDisabled: port.setDisabled })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'all',
    order: 10,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, webjsxSlot('freddie-plugin-inventory-settings-tab')))
}
