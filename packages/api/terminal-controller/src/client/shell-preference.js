/** Browser-local shell preference; Host discovery decides whether the saved path is usable. */
const KEY = 'freddie.terminal.shell'

/**
 * Read the browser preference.
 * @returns {string | null} the last selected shell path, or null when storage is unavailable.
 */
export function preferredShell() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  } catch (_storageUnavailable) {
    return null
  }
}

/**
 * Remember the selected shell without making storage a startup dependency.
 * @param {string} path - verified executable path offered by the Host.
 * @returns {void}
 */
export function rememberShell(path) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, path)
  } catch (_privateBrowsingOrQuotaFailureLeavesThisLaunchUsable) {
  }
}
