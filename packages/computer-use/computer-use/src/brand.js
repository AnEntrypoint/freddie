/**
 * Computer-use provider identities.
 * @module @freddie/freddie-computer-use/brand
 */

/**
 * Brand a provider-owned name without changing or validating it.
 * @param {string} name - name chosen by the provider implementation.
 * @returns {string} the same name, identifying a computer-use registration.
 */
export function ComputerUseProviderName(name) {
  return name
}
