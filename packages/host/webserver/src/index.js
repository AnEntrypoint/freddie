import { createServer } from 'node:http'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { renderIndexInjections } from './injections.js'

export { renderIndexInjections } from './injections.js'
export { etagOf, sendFile } from './static-file.js'

export function stripHmrPrefix(pathname) {
  if (!pathname.startsWith('/__hmr/')) return pathname
  const rest = pathname.slice('/__hmr/'.length)
  const slash = rest.indexOf('/')
  if (slash === -1) return '/'
  return rest.slice(slash) || '/'
}

export class WebServer extends Service {
  static Config = z.object({
    host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).required(),
    port: z.natural().max(65535).required(),
  })

  exact = new Map()
  prefixes = new Map()
  upgrades = new Map()
  upgradedSockets = new Set()
  indexTaps = []
  fallback
  server
  listenedPort

  constructor(ctx, config) {
    super(ctx, 'webServer')
    this.config = config
  }

  get port() {
    return this.listenedPort
  }

  get host() {
    return this.config.host
  }

  register(route) {
    const table = route.kind === 'exact' ? this.exact : this.prefixes
    if (table.has(route.path)) {
      throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
    }
    table.set(route.path, route)
    return () => { table.delete(route.path) }
  }

  registerUpgrade(route) {
    if (this.upgrades.has(route.path)) {
      throw new Error(`webserver: duplicate upgrade route "${route.path}"`)
    }
    this.upgrades.set(route.path, route)
    return () => { this.upgrades.delete(route.path) }
  }

  registerFallback(handler) {
    if (this.fallback !== undefined) {
      throw new Error('webserver: fallback already registered')
    }
    this.fallback = handler
    return () => { this.fallback = undefined }
  }

  tapIndex(transform) {
    this.indexTaps.push(transform)
    return () => {
      const at = this.indexTaps.indexOf(transform)
      if (at !== -1) this.indexTaps.splice(at, 1)
    }
  }

  async [Service.init]() {
    const handle = async (req, res) => {
      const incoming = req.url ?? '/'
      const parsed = new URL(incoming, 'http://x')
      const rawPath = stripHmrPrefix(parsed.pathname)
      if (rawPath !== parsed.pathname) req.url = `${rawPath}${parsed.search}`
      const route = this.match(rawPath)
      if (route !== undefined) {
        await route.handler(req, res)
        return
      }
      const fallback = this.fallback
      if (fallback === undefined) {
        res.writeHead(404)
        res.end()
        return
      }
      await fallback(req, res)
    }
    this.server = createServer((req, res) => {
      handle(req, res).catch((err) => {
        this.ctx.logger.warn(err instanceof Error ? err : new Error(String(err)))
        if (res.headersSent) {
          res.destroy()
          return
        }
        res.writeHead(400)
        res.end()
      })
    })
    this.server.on('upgrade', (req, socket, head) => {
      const onError = (error) => {
        this.ctx.logger.warn(error)
        socket.destroy()
      }
      socket.on('error', onError)
      socket.once('close', () => {
        socket.off('error', onError)
        this.upgradedSockets.delete(socket)
      })
      let route
      try {
        route = this.upgrades.get(stripHmrPrefix(new URL(req.url ?? '/', 'http://x').pathname))
      } catch (error) {
        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        socket.destroy()
        return
      }
      if (route === undefined) {
        socket.destroy()
        return
      }
      this.upgradedSockets.add(socket)
      try {
        Promise.resolve(route.handler(req, socket, head)).catch((error) => {
          this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
          socket.destroy()
        })
      } catch (error) {
        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        socket.destroy()
      }
    })

    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject)
        this.server.on('error', (err) => { this.ctx.logger.error(err) })
        this.listenedPort = this.server.address().port
        resolve()
      })
    })

    this.ctx.effect(() => async () => {
      const serverClosed = new Promise((resolve) => {
        this.server.close(() => { resolve() })
      })
      this.server.closeAllConnections()
      const upgradedClosed = [...this.upgradedSockets].map(socket => new Promise((resolve) => {
        socket.once('close', () => { resolve() })
        socket.destroy()
      }))
      await Promise.all([serverClosed, ...upgradedClosed])
    }, 'webServer.listen')
  }

  match(pathname) {
    const exact = this.exact.get(pathname)
    if (exact !== undefined) return exact
    let best
    for (const [prefix, route] of this.prefixes) {
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
      if (best === undefined || prefix.length > best.path.length) best = route
    }
    return best
  }

  applyIndexTaps(html) {
    let out = html
    for (const transform of this.indexTaps) out = transform(out)
    return out
  }

  collectIndexInjections() {
    const table = []
    this.ctx.emit('webserver/index-inject', table)
    return table
  }

  renderIndex(html) {
    return this.applyIndexTaps(renderIndexInjections(html, this.collectIndexInjections()))
  }
}

export default WebServer
