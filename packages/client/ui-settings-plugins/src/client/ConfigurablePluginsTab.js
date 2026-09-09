/**
 * Configurable Host plugins contributed to the shared Plugins section.
 *
 * The tab enumerates settings namespaces but never interprets one — a card
 * arrives through `settings.plugin.item` keyed by the namespace it edits, so a
 * plugin that ships a browser half owns its own card and this tab only decides
 * which keys to dispatch.
 */

import { createElement as h, Fragment } from 'webjsx'
import css from './PluginsSettingsSection.css.js'

/** Cast a renderSlot() RenderOutput result into a webjsx-embeddable child. */
function asChild(node) {
  return node
}

/**
 * Render cards registered by plugins that expose editable settings.
 * @param props - locale copy, slot rendering, and the namespaces to dispatch.
 * @returns the card list, or the empty line once the Host has answered.
 */
export function ConfigurablePluginsTab(props) {
  const { t, renderSlot } = props
  const { loaded, namespaces } = props.useConfigurablePlugins(snapshot => snapshot)
  if (namespaces.length > 0) {
    return (
      h('ul', {class: css.cards ?? ''},
        namespaces.map(ns =>
          // One dispatch per namespace, so the list identity is the namespace
          // rather than a position that shifts as cards arrive.
          asChild(renderSlot('settings.plugin.item', {}, { entryKey: ns }))),
      )
    )
  }
  return loaded ? h('p', {class: css.empty ?? ''}, t('empty')) : null
}
