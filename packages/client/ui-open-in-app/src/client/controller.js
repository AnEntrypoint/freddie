import { nameableApps } from './applications.js'

const APPS_PATH = '/open-in-app/apps'
const ICON_PREFIX_PATH = '/open-in-app/icon'
const OPEN_PATH = '/open-in-app/open'
const CHOICE_STORAGE_KEY = 'freddie.open-in-app.choice'

/**
 * Page-lifetime carrier for the three host routes: one shared availability read,
 * the remembered application, and the launch POST. Every failure reads as
 * "unavailable" so the control never surfaces a raw error.
 */
export class OpenInAppController {
  #apps = null
  #loading = null

  /** @returns {string[] | null} the answered application ids, or null before the host answered. */
  known() {
    return this.#apps
  }

  /** @returns {Promise<string[]>} the nameable installed ids; empty when the host refused or is unreachable. */
  load() {
    this.#loading ??= this.#read()
    return this.#loading
  }

  /** @returns {string} the last successfully launched application id, or empty. */
  choice() {
    try {
      return localStorage.getItem(CHOICE_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  }

  /** @param {string} appId application id to remember for the next visit. */
  remember(appId) {
    try {
      localStorage.setItem(CHOICE_STORAGE_KEY, appId)
    } catch {
      return
    }
  }

  /**
   * @param {string} appId catalog id from the availability list.
   * @param {string} path the session's absolute workspace directory.
   * @returns {Promise<boolean>} whether the host acknowledged the launch.
   */
  async launch(appId, path) {
    try {
      const response = await fetch(OPEN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app: appId, path }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * @param {string} appId catalog id.
   * @returns {string} the icon route for that application.
   */
  iconUrl(appId) {
    return `${ICON_PREFIX_PATH}/${encodeURIComponent(appId)}`
  }

  async #read() {
    try {
      const response = await fetch(APPS_PATH, { headers: { accept: 'application/json' } })
      const payload = response.ok ? await response.json() : null
      this.#apps = nameableApps(payload?.apps)
    } catch {
      this.#apps = []
    }
    return this.#apps
  }
}
