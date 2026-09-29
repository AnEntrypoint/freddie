import { DEFAULT_PREFERENCE } from './theme-settings.js'

function bootThemeScript(preference) {
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.body.toggleAttribute('data-ds-dark-theme', dark)
})()`
}

export function bootThemeInjection(
  preference = DEFAULT_PREFERENCE,
) {
  return { kind: 'script', placement: 'body', text: bootThemeScript(preference) }
}
