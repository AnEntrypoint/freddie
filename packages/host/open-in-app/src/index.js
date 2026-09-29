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

export const name = 'host-open-in-app'

export const inject = ['webServer']

export const Config = z.object({
  probeTimeoutMs: z.number().step(1).min(1).max(600_000).default(10_000),
  iconTimeoutMs: z.number().step(1).min(1).max(600_000).default(10_000),
  launchWatchMs: z.number().step(1).min(1).max(600_000).default(1_000),
})

const MAX_BODY_BYTES = 64 * 1024

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

function drainRemainderSoRefusalIsReadable(req) {
  req.resume()
}

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

export function apply(ctx, config) {
  let resolutions
  const availability = () => (resolutions ??= resolveOpenInAppApps(config.probeTimeoutMs).catch(error => {
    ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
    return new Map()
  }))

  const icons = new Map()
  const iconOf = (app, resolved) => {
    let cached = icons.get(app.id)
    if (cached === undefined) {
      cached = extractAppIcon(app, resolved, config.iconTimeoutMs)
      icons.set(app.id, cached)
    }
    return cached
  }

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
