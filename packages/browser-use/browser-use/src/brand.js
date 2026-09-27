/**
 * Browser-use provider identities.
 * @module @freddie/freddie-browser-use/brand
 */

/**
 * Brand a provider-owned name without changing or validating it.
 * @param {string} name - name chosen by the provider implementation.
 * @returns {string} the same name, identifying a browser-use registration.
 */
export function BrowserUseProviderName(name) {
  return name
}
