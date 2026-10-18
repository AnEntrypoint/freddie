import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { sendBody, sendFile } from '@freddie/freddie-host-webserver'
import z from '@freddie/schemastery'

export const name = 'frontend-static'

export const inject = ['webServer']

export const Config = z.object({
  distIndex: z.string().required(),
})

const HTML_MIME = 'text/html; charset=utf-8'

const MIME = {
  '.html': HTML_MIME,
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

const STATIC_MISS_CODES = new Set([
  'ENOENT',
  'EISDIR',
  'ENOTDIR',
])

export async function serveStatic(pathname, req, res, distRoot, distIndex, renderIndex) {
  const target = resolve(normalize(join(distRoot, pathname)))
  if (target !== distRoot && !target.startsWith(distRoot + sep)) {
    res.writeHead(403)
    res.end()
    return
  }
  if (target !== distRoot && target !== distIndex) {
    const served = await sendFile(req, res, target, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    if (!served) {
      res.writeHead(404)
      res.end()
    }
    return
  }
  let body
  try {
    body = await renderIndex()
  } catch (error) {
    if (!STATIC_MISS_CODES.has(error.code)) throw error
    res.writeHead(404)
    res.end()
    return
  }
  await sendBody(req, res, body, { 'content-type': HTML_MIME })
}

export function apply(ctx, config) {
  const distIndex = config.distIndex
  const distRoot = dirname(distIndex)
  const renderIndex = async () =>
    ctx.webServer.renderIndex(await readFile(distIndex, 'utf8'))
  ctx.effect(() => ctx.webServer.registerFallback(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const rawPath = new URL(req.url ?? '/', 'http://x').pathname
    await serveStatic(decodeURIComponent(rawPath), req, res, distRoot, distIndex, renderIndex)
  }), 'frontend-static: fallback seat')
}
