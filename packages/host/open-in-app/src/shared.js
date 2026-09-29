export const OPEN_IN_APP_APPS_PATH = '/open-in-app/apps'

export const OPEN_IN_APP_ICON_PREFIX_PATH = '/open-in-app/icon'

export const OPEN_IN_APP_OPEN_PATH = '/open-in-app/open'

/**
 * `GET /open-in-app/apps` response body: the resolved catalog ids in menu order.
 * An empty array means the host verified no catalog application, which is also
 * what an SSH-launched process answers.
 * @typedef {{ apps: string[] }} OpenInAppAppsPayload
 */

/**
 * `POST /open-in-app/open` request body: one resolved catalog id and one
 * absolute path naming an existing directory.
 * @typedef {{ app: string, path: string }} OpenInAppOpenPayload
 */

/**
 * `POST /open-in-app/open` response body.
 * @typedef {{ ok: true } | { code: string, message: string }} OpenInAppOpenResult
 */
