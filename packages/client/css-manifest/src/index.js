import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Service } from '@freddie/cordis'
import { sendBody, sendFile } from '@freddie/freddie-host-webserver'
import { cssManifest } from './manifest.js'

export { cssManifest } from './manifest.js'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const byId = new Map(cssManifest.map(entry => [entry.id, join(repoRoot, entry.path)]))

const CSS_MIME = 'text/css; charset=utf-8'

const PREFIX = '/styles/'
const SUFFIX = '.css'
const BUNDLE_ID = 'app'
const BUNDLE_PATH = `${PREFIX}${BUNDLE_ID}${SUFFIX}`
const IMMUTABLE = 'public, max-age=31536000, immutable'

function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export class CssManifest extends Service {
  static inject = ['webServer']

  built = { stamp: '', rev: '', body: Buffer.alloc(0) }

  constructor(ctx) {
    super(ctx, 'cssManifest')
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/styles', handler: this.serveStyles }), 'css-manifest: styles route')
    ctx.on('webserver/index-inject', (table) => {
      table.push({
        kind: 'html',
        placement: 'head',
        html: `<link rel="stylesheet" data-css-manifest href="${escapeHtmlAttribute(this.href())}">`,
      })
    })
  }

  revision() {
    return this.build().rev
  }

  href() {
    return `${BUNDLE_PATH}?rev=${this.revision()}`
  }

  build() {
    let stamp = ''
    for (const [, path] of byId) {
      let stats
      try {
        stats = statSync(path)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        stamp += '-;'
        continue
      }
      stamp += `${stats.size}:${Math.trunc(stats.mtimeMs)};`
    }
    if (stamp === this.built.stamp) return this.built
    const hash = createHash('sha1')
    const parts = []
    for (const [id, path] of byId) {
      let content
      try {
        content = readFileSync(path)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        continue
      }
      hash.update(id)
      hash.update('\0')
      hash.update(content)
      hash.update('\0')
      parts.push(Buffer.from(`/* ${id} */\n`), content, Buffer.from('\n'))
    }
    this.built = { stamp, rev: hash.digest('hex').slice(0, 12), body: Buffer.concat(parts) }
    return this.built
  }

  serveStyles = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://x')
    const pathname = decodeURIComponent(url.pathname)
    if (pathname === BUNDLE_PATH) {
      await this.serveBundle(req, res, url.searchParams.get('rev'))
      return
    }
    const id = pathname.startsWith(PREFIX) && pathname.endsWith(SUFFIX)
      ? pathname.slice(PREFIX.length, -SUFFIX.length)
      : undefined
    const filePath = id === undefined ? undefined : byId.get(id)
    const served = filePath === undefined ? false : await sendFile(req, res, filePath, {
      'content-type': CSS_MIME,
      'cache-control': 'no-cache',
    })
    if (!served) {
      res.writeHead(404)
      res.end()
    }
  }

  async serveBundle(req, res, rev) {
    const built = this.build()
    const etag = `"${built.rev}"`
    const headers = {
      'content-type': CSS_MIME,
      'cache-control': rev === built.rev ? IMMUTABLE : 'no-cache',
      'etag': etag,
    }
    await sendBody(req, res, built.body, headers)
  }
}

export default CssManifest
