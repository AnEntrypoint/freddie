import { nameableApps } from './applications.js'

const APPS_PATH = '/open-in-app/apps'
const ICON_PREFIX_PATH = '/open-in-app/icon'
const OPEN_PATH = '/open-in-app/open'
const CHOICE_STORAGE_KEY = 'freddie.open-in-app.choice'

export class OpenInAppController {
  #apps = null
  #loading = null

  known() {
    return this.#apps
  }

  load() {
    this.#loading ??= this.#read()
    return this.#loading
  }

  choice() {
    try {
      return localStorage.getItem(CHOICE_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  }

  remember(appId) {
    try {
      localStorage.setItem(CHOICE_STORAGE_KEY, appId)
    } catch {
      return
    }
  }

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
