import { createServer } from 'node:http'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { renderIndexInjections } from './injections.js'

export { renderIndexInjections } from './injections.js'

/**
 * The browser HTTP carrier service. Activation listens immediately. Route
 * registration order does not affect requests because configured named routes
 * must be distinct, and the fallback handler answers anything not yet claimed
 * during startup with 404 until its owner registers. A listen failure rejects
 * initialization, and the boot process reports the failed fiber.
 */
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

  /**
   * Register a named route. Duplicate (kind, path) throws — route patterns are
   * a composition-level contract, so a collision is a misconfiguration.
   */
  register(route) {
    const table = route.kind === 'exact' ? this.exact : this.prefixes
    if (table.has(route.path)) {
      throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
    }
    table.set(route.path, route)
    return () => { table.delete(route.path) }
  }

  /**
   * Register an exact-path HTTP upgrade route. Duplicate paths throw because
   * one socket can have only one protocol owner.
   */
  registerUpgrade(route) {
    if (this.upgrades.has(route.path)) {
      throw new Error(`webserver: duplicate upgrade route "${route.path}"`)
    }
    this.upgrades.set(route.path, route)
    return () => { this.upgrades.delete(route.path) }
  }

  /**
   * Claim the fallback seat: the handler answering every request no named
   * route matches (the SPA dist server in the shipped Web composition). One
   * owner only — a second registration throws, because two fallbacks cannot
   * compose.
   */
  registerFallback(handler) {
    if (this.fallback !== undefined) {
      throw new Error('webserver: fallback already registered')
    }
    this.fallback = handler
    return () => { this.fallback = undefined }
  }

  /**
   * Register a raw-HTML index transform, the escape hatch for markup no
   * structured injection row expresses: renderIndex applies taps in
   * registration order after rendering the structured rows.
   */
  tapIndex(transform) {
    this.indexTaps.push(transform)
    return () => {
      const at = this.indexTaps.indexOf(transform)
      if (at !== -1) this.indexTaps.splice(at, 1)
    }
  }

  /** Listen; resolves once the socket is bound (rejection = FAILED fiber). */
  async [Service.init]() {
    const handle = async (req, res) => {
      // node:http always sets url on server requests; `?? '/'` guards the
      // client-side IncomingMessage type only.
      const rawPath = new URL(req.url ?? '/', 'http://x').pathname
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
    // Last-resort guard: handle() rejecting would otherwise be an unhandled
    // rejection killing the process on one malformed request (bad %-escape,
    // client dropping mid-body). Per-request failures log and answer 400 —
    // never a process exit.
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
        route = this.upgrades.get(new URL(req.url ?? '/', 'http://x').pathname)
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

    // Node does not include upgraded sockets in closeAllConnections(). The service
    // owns them with the other connections, so it tracks and destroys them explicitly.
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

  /** Longest-prefix-wins over the prefix table after an exact-table miss. */
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

  /**
   * Run an index.html body through the registered taps in registration order
   * — called by the fallback owner on every index response it renders.
   */
  applyIndexTaps(html) {
    let out = html
    for (const transform of this.indexTaps) out = transform(out)
    return out
  }

  /**
   * Gather the structured injection table: one `webserver/index-inject` emit,
   * every subscriber pushes its current rows. Fresh per call, so subscribers
   * read live state (module graph, theme preference) at emit time.
   */
  collectIndexInjections() {
    const table = []
    this.ctx.emit('webserver/index-inject', table)
    return table
  }

  /**
   * Render one index.html body: the structured injection table first, then
   * the raw `tapIndex` transforms over the result.
   */
  renderIndex(html) {
    return this.applyIndexTaps(renderIndexInjections(html, this.collectIndexInjections()))
  }
}

export default WebServer
