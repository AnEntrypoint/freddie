/**
 * @freddie/freddie-client-css-manifest — serves the buildless plain CSS files
 * (converted off CSS Modules) that {@link cssManifest} lists, and injects one
 * `<link rel="stylesheet">` per entry into the page head.
 * @module @freddie/freddie-client-css-manifest
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cssManifest } from './manifest.js'

export { cssManifest } from './manifest.js'

/** Stable Cordis plugin name. */
export const name = 'css-manifest'

/** Service required to register the route and index injection. */
export const inject = ['webServer']

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const byId = new Map(cssManifest.map(entry => [entry.id, join(repoRoot, entry.path)]))

const CSS_MIME = 'text/css; charset=utf-8'

function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const PREFIX = '/styles/'
const SUFFIX = '.css'

const serveStyles = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  /* v8 ignore next -- node:http always sets url on server requests */
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  const id = pathname.startsWith(PREFIX) && pathname.endsWith(SUFFIX)
    ? pathname.slice(PREFIX.length, -SUFFIX.length)
    : undefined
  const filePath = id === undefined ? undefined : byId.get(id)
  if (filePath === undefined) {
    res.writeHead(404)
    res.end()
    return
  }
  try {
    const body = await readFile(filePath)
    res.writeHead(200, { 'content-type': CSS_MIME })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}

/**
 * Claim the /styles prefix route and push one stylesheet-link row per
 * manifest entry into the index injection table.
 * @param ctx - plugin context carrying the webServer service.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/styles', handler: serveStyles }), 'css-manifest: styles route')
  ctx.on('webserver/index-inject', (table) => {
    for (const entry of cssManifest) {
      table.push({
        kind: 'html',
        placement: 'head',
        html: `<link rel="stylesheet" href="${escapeHtmlAttribute(`/styles/${entry.id}.css`)}">`,
      })
    }
  })
}
