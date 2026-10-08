import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendFile } from '@freddie/freddie-host-webserver'
import { cssLinks, importMapExact, importMapPrefix, vendorPackages } from './manifest.js'

export { cssLinks, importMapExact, importMapPrefix, vendorPackages } from './manifest.js'

export const name = 'vendor-modules'

export const inject = ['webServer']

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const vendorRoot = join(packageRoot, 'vendor')
const localRequire = createRequire(import.meta.url)

const PREFIX = '/vendor/'

const LIVE_WORKSPACE_PACKAGES = new Set([
  '@freddie/freddie-client-web',
  '@freddie/freddie-client-ui-slots',
  '@freddie/freddie-client-ui-primitives',
  '@freddie/webjsx',
])

function resolveLiveWorkspaceFile(relPath) {
  const match = /^(@freddie\/[^/@]+)@[^/]+\/(.+)$/.exec(relPath)
  if (match === null || !LIVE_WORKSPACE_PACKAGES.has(match[1])) return undefined
  const [, pkgName, rest] = match
  return localRequire.resolve(`${pkgName}/${rest}`)
}

const MIME_BY_EXTENSION = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}
const JS_MIME = 'text/javascript; charset=utf-8'

function contentTypeFor(relPath) {
  const dot = relPath.lastIndexOf('.')
  const ext = dot === -1 ? '' : relPath.slice(dot)
  return MIME_BY_EXTENSION[ext] ?? JS_MIME
}

const serveVendor = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  if (!pathname.startsWith(PREFIX)) {
    res.writeHead(404)
    res.end()
    return
  }
  const relPath = pathname.slice(PREFIX.length)
  if (relPath.includes('..')) {
    res.writeHead(403)
    res.end()
    return
  }
  let filePath
  try {
    filePath = resolveLiveWorkspaceFile(relPath) ?? join(vendorRoot, relPath)
  } catch {
    res.writeHead(404)
    res.end()
    return
  }
  const revalidate = relPath.startsWith('@freddie/')
    || !relPath.includes('@')
  const served = await sendFile(req, res, filePath, {
    'content-type': contentTypeFor(relPath),
    'cache-control': revalidate ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  if (!served) {
    res.writeHead(404)
    res.end()
  }
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const CLIENT_BUILD_ENV_PREFIX = 'FREDDIE_CLIENT_'

function renderProcessShim() {
  const env = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith(CLIENT_BUILD_ENV_PREFIX) && value !== undefined) env[name] = value
  }
  const json = JSON.stringify(env).replaceAll('<', '\\u003c')
  return `<script>globalThis.process ??= { env: ${json}, execArgv: [], versions: { node: '0.0.0' } }</script>`
}

const DEFAULT_CLIENT_TITLE = 'FREDDIE Local Build'

function renderTitle() {
  const title = escapeHtmlAttribute(process.env.FREDDIE_CLIENT_TITLE ?? DEFAULT_CLIENT_TITLE)
  return `<title>${title}</title>`
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/vendor', handler: serveVendor }), 'vendor-modules: vendor route')
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'html',
      placement: 'head',
      html: renderTitle(),
    })
    table.push({
      kind: 'html',
      placement: 'head',
      html: renderProcessShim(),
    })
    table.push({
      kind: 'importmap-entries',
      imports: { ...importMapExact, ...importMapPrefix },
    })
    for (const href of cssLinks) {
      table.push({
        kind: 'html',
        placement: 'head',
        html: `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`,
      })
    }
  })
}
