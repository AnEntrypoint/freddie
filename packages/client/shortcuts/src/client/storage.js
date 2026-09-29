
import { ShortcutPersistence } from './protocol.js'

export const SHORTCUT_STORAGE_KEY = 'freddie.keybindings.v1'

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
