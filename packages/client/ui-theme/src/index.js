/** Host registration for the browser theme preference and pre-plugin palette. */

import { settingsNamespace } from '@freddie/freddie-settings'
import { bootThemeInjection } from './boot-theme.js'
import {
  DEFAULT_PREFERENCE, THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema,
} from './theme-settings.js'

export {
  DEFAULT_PREFERENCE, THEME_PREFERENCE_FIELD, THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE,
} from './theme-settings.js'

const THEME_NAMESPACE = settingsNamespace(THEME_SETTINGS_NAMESPACE)

/** Read the registered preference or use the schema default without a settings provider. */
function readPreference(ctx) {
  const settings = ctx.get('settings')
  if (settings === undefined) return DEFAULT_PREFERENCE
  const section = settings.get(THEME_NAMESPACE)
  if (section === undefined) return DEFAULT_PREFERENCE
  return section.preference
}

/**
 * Register the durable theme section when the optional settings service is
 * composed, and answer every index injection collection with the current
 * theme bootstrap row.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(THEME_NAMESPACE, ThemeSettingsSchema)
  })
  ctx.on('webserver/index-inject', (table) => {
    table.push(bootThemeInjection(readPreference(ctx)))
  })
}
