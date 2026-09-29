import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './PluginInventorySettingsTab.js'
import { en } from './locales.js'
import { createPluginManagerPort } from './plugin-manager-port.js'

export const NS = 'settings.pluginInventory'

export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory', 'remote.pluginManager']

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
