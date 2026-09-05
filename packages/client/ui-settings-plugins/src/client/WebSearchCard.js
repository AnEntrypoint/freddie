/**
 * The web-search provider's card: its endpoint, its per-request search budget,
 * and the key — which is written through the credentials domain, never into
 * the settings section, so the literal never rides a response.
 */

import { createElement as h, Fragment } from 'webjsx'
import { SecretField, ValueField } from './fields.js'
import { PluginCard } from './PluginCard.js'

/**
 * Render the web-search card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function WebSearchCard(props) {
  const { t } = props
  const state = props.useWebSearchCard(snapshot => snapshot)
  const disabled = !state.writable
  return h(PluginCard, {
    t,
    titleKey: 'webSearchTitle',
    descriptionKey: 'webSearchDescription',
    state,
    onSave: props.save,
    onDiscard: props.discard,
  },
    h(SecretField, {
      id: 'plugin-config-web-search-key',
      label: t('webSearchApiKey'),
      hint: t('webSearchApiKeyHint'),
      // The credentials domain accepts a key even when the settings document
      // itself is read-only; they are separate stores with separate refusals.
      // Its own writability is what disables this control — a key sourced
      // from the process environment cannot be written from here.
      disabled: !state.apiKeyWritable,
      text: state.apiKey.text,
      configured: state.apiKeyConfigured,
      stateLabel: state.apiKeyConfigured ? t('webSearchApiKeySet') : t('webSearchApiKeyUnset'),
      onEdit: (text) => { props.edit('apiKey', text) },
    }),
    h(ValueField, {
      id: 'plugin-config-web-search-endpoint',
      label: t('webSearchBaseUrl'),
      hint: t('webSearchBaseUrlHint'),
      overriddenLabel: t('overridden'),
      resetLabel: t('reset'),
      invalidLabel: t('invalidNumber'),
      disabled,
      ...state.baseURL,
      onEdit: (text) => { props.edit('baseURL', text) },
      onReset: () => { props.resetField('baseURL') },
    }),
    h(ValueField, {
      id: 'plugin-config-web-search-max-uses',
      label: t('webSearchMaxUses'),
      hint: t('webSearchMaxUsesHint'),
      overriddenLabel: t('overridden'),
      resetLabel: t('reset'),
      invalidLabel: t('invalidNumber'),
      numeric: true,
      disabled,
      ...state.maxUses,
      onEdit: (text) => { props.edit('maxUses', text) },
      onReset: () => { props.resetField('maxUses') },
    }),
  )
}
