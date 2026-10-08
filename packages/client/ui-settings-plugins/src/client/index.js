import { resolveSlotLabel } from '@freddie/freddie-client-ui-slots'
import { AgentLoopCard } from './AgentLoopCard.js'
import { BashCard } from './BashCard.js'
import { ConfigurablePluginsTab } from './ConfigurablePluginsTab.js'
import { PluginsSettingsSection } from './PluginsSettingsSection.js'
import { AGENT_LOOP_NS, AgentLoopCardController } from './agent-loop-card-controller.js'
import { SHELL_NS, BashCardController } from './bash-card-controller.js'
import { ConfigurablePluginsTabController } from './tab-store.js'
import { en } from './locales.js'

const NS = 'settings.plugins'

export const inject = ['slots', 'locale', 'settingsScope']

export function apply(ctx) {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-settings-plugins: section dictionaries')

  const bash = new BashCardController(ctx.settingsScope.bind({ namespace: SHELL_NS }))
  const agentLoop = new AgentLoopCardController(ctx.settingsScope.bind({ namespace: AGENT_LOOP_NS }))

  const configurable = new ConfigurablePluginsTabController(
    ctx.settingsScope.describe(), () => ctx.slots.entries('settings.plugin.item'))
  ctx.effect(() => () => { configurable.dispose() }, 'ui-settings-plugins: tab directory')
  ctx.effect(
    () => ctx.slots.subscribe('settings.plugin.item', () => { configurable.refresh() }),
    'ui-settings-plugins: card ledger',
  )

  let tabsVersion = -1
  let tabsRevision = -1
  let tabs = []
  const sectionInjected = () => ({
    hooks: {
      tabs: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.plugins.tab')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== tabsVersion || revision !== tabsRevision) {
            tabsVersion = version
            tabsRevision = revision
            tabs = ctx.slots.entries('settings.plugins.tab')
              .map(entry => ({
                id: entry.options.id ?? '',
                order: entry.options.order ?? 0,
                label: resolveSlotLabel(entry.options.label) ?? '',
              }))
              .sort((a, b) => a.order - b.order)
          }
          return tabs
        },
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.plugins.tab', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'plugins',
    order: 15,
    label: () => t('nav'),
    locale: NS,
    inject: sectionInjected,
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  }, PluginsSettingsSection))

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'configurable',
    order: 0,
    label: () => t('configurableTab'),
    locale: NS,
    inject: () => configurable.inject(),
    children: { 'settings.plugin.item': { kind: 'keyed', scope: 'root' } },
  }, ConfigurablePluginsTab))

  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: SHELL_NS,
      locale: NS,
      inject: () => bash.inject(),
    }, BashCard)
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: AGENT_LOOP_NS,
      locale: NS,
      inject: () => agentLoop.inject(),
    }, AgentLoopCard)
  })
}
