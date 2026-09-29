import { createElement as h, Fragment } from '@freddie/webjsx'
import css from './PluginsSettingsSection.css.js'

function asChild(node) {
  return node
}

export function ConfigurablePluginsTab(props) {
  const { t, renderSlot } = props
  const { loaded, namespaces } = props.useConfigurablePlugins(snapshot => snapshot)
  if (namespaces.length > 0) {
    return (
      h('ul', {class: css.cards ?? ''},
        namespaces.map(ns =>
          asChild(renderSlot('settings.plugin.item', {}, { entryKey: ns }))),
      )
    )
  }
  return loaded ? h('p', {class: css.empty ?? ''}, t('empty')) : null
}
