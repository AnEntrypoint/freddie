/**
 * Host half of open-in-app: three routes on the composition's `webServer`
 * serving the resolved application catalog, per-application icons, and the
 * launch endpoint a browser surface posts to.
 *
 * Security has one home, here, and it is a tighter pin than upstream's. dsh asks
 * the composition's `connection` service for a rejection, which stacks a
 * DNS-rebinding and origin fence on top of the deployment's browser
 * authentication. freddie's connection README states plainly that its fence "is
 * a reachability policy, not authentication" and that the Web carrier "provides
 * no authentication layer" — so browser authentication is not something this
 * package can lean on. Every route therefore passes an EMPTY trust list to
 * `isTrustedApiRequest`, which pins it to loopback: the same pin
 * `client-connection` applies to its `PRIVILEGED_METHODS`, `host.openPath`
 * among them. Opening the workspace in a chosen application is that sibling
 * host action's equal — both drive the operator's desktop from an HTTP request —
 * so it takes the equal pin, and the config carries no `trustedHosts` field that
 * could widen it.
 *
 * On top of that fence the open route validates its body at the wire: an
 * `application/json` media type, a 64 KiB ceiling, string `app`/`path` fields, a
 * resolved-and-available catalog id, and an absolute path naming an existing
 * directory.
 *
 * The catalog resolves lazily, once per plugin life, on the first request that
 * needs it, into one map of verified launchers: the apps route serves its keys,
 * the open route launches its values, and a click, menu open, or page reload
 * never re-runs detection. A launch whose executable is gone (`ENOENT`)
 * invalidates that ONE entry and re-resolves it once, so an uninstalled
 * application disappears from the list without a restart while a newly installed
 * one still waits for the next process.
 * @module @freddie/freddie-host-open-in-app
 */

import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { isTrustedApiRequest } from '@freddie/freddie-client-connection/src/api-request-trust.js'
import z from '@freddie/schemastery'
import { OPEN_IN_APP_CATALOG } from './catalog.js'
import { extractAppIcon } from './icons.js'
import { launchResolved, resolveLaunch, resolveOpenInAppApps } from './resolver.js'
import {
  OPEN_IN_APP_APPS_PATH, OPEN_IN_APP_ICON_PREFIX_PATH, OPEN_IN_APP_OPEN_PATH,
} from './shared.js'

export {
  OPEN_IN_APP_APPS_PATH, OPEN_IN_APP_ICON_PREFIX_PATH, OPEN_IN_APP_OPEN_PATH,
} from './shared.js'

/** Cordis function-plugin name. */
export const name = 'host-open-in-app'

/** The route carrier; the trust fence is imported, not injected, because it is a pure request predicate. */
export const inject = ['webServer']

/**
 * Open-in-app host configuration: three INDEPENDENT per-command deadlines, so
 * tuning detection never changes how long a launch is watched.
 */
export const Config = z.object({
  /** Deadline per catalog-resolution host command (`xcode-select`, each `reg.exe` read). */
  probeTimeoutMs: z.number().step(1).min(1).max(600_000).default(10_000),
  /** Deadline per icon-extraction host command (`plutil`/`sips`, the PowerShell extraction). */
  iconTimeoutMs: z.number().step(1).min(1).max(600_000).default(10_000),
  /**
   * Early-failure watch window per launch: a launcher still running when the
   * window closes counts as launched and keeps running, so this bounds how long
   * a successful launch is held, not how long the application may live.
   */
  launchWatchMs: z.number().step(1).min(1).max(600_000).default(1_000),
})

/** Open-route bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

/** JSON response (no-store: availability and launch outcomes are live facts). */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** 405 naming the route's one supported method. */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** A refusal that leaves the body undrained reaches the client as a socket cut, not a response. */
function drainRemainderSoRefusalIsReadable(req) {
  req.resume()
}

/** The media type without parameters, lower-cased; a missing header never matches a real type. */
function mediaTypeEssence(contentTypeHeader) {
  return String(contentTypeHeader).split(';', 1)[0]?.trim().toLowerCase()
}

async function existsAsDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Collect a bounded request body as UTF-8 text.
 * @returns the body, or null past the ceiling.
 */
async function readBoundedBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      drainRemainderSoRefusalIsReadable(req)
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

/** Validate one open-route body at the wire: a JSON object with string app/path. */
function parseOpenBody(text) {
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  return typeof body.app === 'string' && typeof body.path === 'string' ? body : null
}

/**
 * Mount the apps, icon, and open routes behind the loopback trust fence.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx, config) {
  /**
   * Lazy once-per-plugin-life resolution; the map is the mutable authority. A
   * resolution that fails is logged once and yields an empty catalog for the
   * process rather than rejecting every later request with no operator action
   * available — detection is best-effort by design, and a `reg.exe` hiccup on
   * one host must not turn the package into a permanent 500.
   */
  let resolutions
  const availability = () => (resolutions ??= resolveOpenInAppApps(config.probeTimeoutMs).catch(error => {
    ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
    return new Map()
  }))

  /** Per-app icon promise cache (a null result is cached too, so extraction runs at most once). */
  const icons = new Map()
  const iconOf = (app, resolved) => {
    let cached = icons.get(app.id)
    if (cached === undefined) {
      cached = extractAppIcon(app, resolved, config.iconTimeoutMs)
      icons.set(app.id, cached)
    }
    return cached
  }

  /**
   * Replace one stale resolution after a missing-executable launch: the entry
   * (and its icon) re-resolves once, and an entry that no longer resolves leaves
   * the map, so the next apps read no longer offers it.
   */
  const refreshResolution = async app => {
    const map = await availability()
    const fresh = await resolveLaunch(app, config.probeTimeoutMs)
    icons.delete(app.id)
    if (fresh === null) {
      map.delete(app.id)
      return undefined
    }
    map.set(app.id, fresh)
    return fresh
  }

  /** Answer an untrusted request; true when it was refused. */
  const isRejected = (req, res) => {
    if (isTrustedApiRequest(req, [])) return false
    res.writeHead(403)
    res.end('forbidden')
    return true
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPEN_IN_APP_APPS_PATH,
    handler: async (req, res) => {
      if (isRejected(req, res)) return
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      sendJson(res, 200, { apps: [...(await availability()).keys()] })
    },
  }), `host-open-in-app: GET ${OPEN_IN_APP_APPS_PATH}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: OPEN_IN_APP_ICON_PREFIX_PATH,
    handler: async (req, res) => {
      if (isRejected(req, res)) return
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      const pathname = new URL(String(req.url), 'http://localhost').pathname
      const id = pathname.slice(OPEN_IN_APP_ICON_PREFIX_PATH.length).replace(/^\//, '')
      const noIcon = () => sendJson(res, 404, { code: 'not-found', message: `no icon for ${id}` })
      const app = OPEN_IN_APP_CATALOG.find(entry => entry.id === id)
      if (app === undefined) {
        noIcon()
        return
      }
      const resolved = (await availability()).get(app.id)
      if (resolved === undefined) {
        noIcon()
        return
      }
      const icon = await iconOf(app, resolved)
      if (icon === null) {
        noIcon()
        return
      }
      res.statusCode = 200
      res.setHeader('content-type', icon.contentType)
      res.setHeader('cache-control', 'public, max-age=3600')
      res.end(icon.bytes)
    },
  }), `host-open-in-app: GET ${OPEN_IN_APP_ICON_PREFIX_PATH}/<id>`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPEN_IN_APP_OPEN_PATH,
    handler: async (req, res) => {
      if (isRejected(req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      if (mediaTypeEssence(req.headers['content-type']) !== 'application/json') {
        sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
        return
      }
      let text
      try {
        text = await readBoundedBody(req)
      } catch {
        sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' })
        return
      }
      if (text === null) {
        sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' })
        return
      }
      const parsed = parseOpenBody(text)
      if (parsed === null) {
        sendJson(res, 400, { code: 'bad-request', message: 'request body must be JSON with string "app" and "path"' })
        return
      }
      const app = OPEN_IN_APP_CATALOG.find(entry => entry.id === parsed.app)
      const resolved = app === undefined ? undefined : (await availability()).get(app.id)
      if (resolved === undefined) {
        sendJson(res, 400, { code: 'bad-request', message: `unknown or unavailable app: ${parsed.app}` })
        return
      }
      if (parsed.path === '' || !isAbsolute(parsed.path)) {
        sendJson(res, 400, { code: 'bad-request', message: 'path must be an absolute directory path' })
        return
      }
      if (!await existsAsDirectory(parsed.path)) {
        sendJson(res, 404, { code: 'not-found', message: `directory does not exist: ${parsed.path}` })
        return
      }
      let outcome = await launchResolved(resolved, parsed.path, config.launchWatchMs)
      if (outcome === 'missing') {
        const fresh = await refreshResolution(app)
        outcome = fresh === undefined
          ? 'failed'
          : await launchResolved(fresh, parsed.path, config.launchWatchMs)
      }
      if (outcome === 'launched') sendJson(res, 200, { ok: true })
      else sendJson(res, 502, { code: 'launch-failed', message: `failed to launch ${app.id}` })
    },
  }), `host-open-in-app: POST ${OPEN_IN_APP_OPEN_PATH}`)
}
