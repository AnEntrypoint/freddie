/**
 * Route paths and wire payload shapes of the three open-in-app routes,
 * published as the browser-safe `./shared` subpath: constants and JSDoc types
 * only, no runtime identity, so a browser bundle can inline this module without
 * pulling in the host's `node:` imports.
 *
 * The document-relative route forms dsh pairs with each absolute path are
 * deliberately absent: freddie has no browser surface reading this subpath yet,
 * and the paths below are the whole contract such a surface needs.
 * @module @freddie/freddie-host-open-in-app/shared
 */

/** GET route path serving the catalog ids resolved as installed, in menu order. */
export const OPEN_IN_APP_APPS_PATH = '/open-in-app/apps'

/** GET prefix path serving one application's extracted icon by catalog id. */
export const OPEN_IN_APP_ICON_PREFIX_PATH = '/open-in-app/icon'

/** POST route path launching one catalog application on one workspace directory. */
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
