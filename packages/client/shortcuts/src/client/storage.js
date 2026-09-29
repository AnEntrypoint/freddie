/**
 * Origin-local preference adapter. Bindings are the only thing this package
 * ever persists, and they never leave the browser: the document stays inside
 * the origin's own storage and is reread before every write so a second tab's
 * edit cannot be clobbered blind.
 */

import { ShortcutPersistence } from './protocol.js'

/** Browser-profile and origin-local preference key. */
export const SHORTCUT_STORAGE_KEY = 'freddie.keybindings.v1'

/**
 * Connect localStorage and same-origin external updates to the shared
 * transaction coordinator.
 * @param windowLike - owning browser window.
 * @param platform - visiting device platform.
 * @param publish - accepts complete configuration snapshots.
 * @returns adapter and lifecycle disposal.
 */
export function webShortcutStorage(windowLike, platform, publish) {
  const profile = `web:${platform}`
  const persistence = new ShortcutPersistence({
    read: () => windowLike.localStorage.getItem(SHORTCUT_STORAGE_KEY),
    write: raw => { windowLike.localStorage.setItem(SHORTCUT_STORAGE_KEY, raw) },
  }, profile, publish)
  const changed = (event) => {
    if (event.key === null || event.key === SHORTCUT_STORAGE_KEY) void persistence.readCurrent()
  }
  windowLike.addEventListener('storage', changed)
  return {
    get: (definitions) => {
      persistence.setDefinitions(definitions)
      return persistence.readCurrent()
    },
    edit: (edit, revision) => persistence.edit(edit, revision),
    dispose: () => {
      windowLike.removeEventListener('storage', changed)
      persistence.dispose()
    },
  }
}
