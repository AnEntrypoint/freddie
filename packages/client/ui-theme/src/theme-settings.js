import z from '@freddie/schemastery'

export const THEME_PREFERENCES = ['light', 'dark', 'system']

export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

export const THEME_PREFERENCE_FIELD = 'preference'

export const DEFAULT_PREFERENCE = 'system'

export const ThemeSettingsSchema = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
})

export function isThemePreference(value) {
  return THEME_PREFERENCES.some(preference => preference === value)
}
