import { Context, Service } from '@freddie/cordis'
import { ModuleLoader } from '@freddie/cordis-plugin-loader'
import { FSWatcher, watch } from 'chokidar'
import { dirname, relative, resolve } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { handleError } from './error.js'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import picomatch from 'picomatch'
import z from '@freddie/schemastery'
import { AsyncLocalStorage } from 'node:async_hooks'

async function loadDependencies(job, ignored = new Set()) {
  const dependencies = new Set()
  async function traverse(job) {
    if (ignored.has(job.url) || dependencies.has(job.url)) return
    if (job.url.startsWith('node:') || job.url.includes('/node_modules/')) return
    dependencies.add(job.url)
    const children = await job.linked
    await Promise.all(Array.prototype.map.call(children, traverse))
  }
  await traverse(job)
  return dependencies
}

async function findWatchRoot(filename) {
  let root = dirname(filename)
  let depth = 0
  while (true) {
    try {
      if (!(await stat(root)).isDirectory()) throw new Error(`config watch parent is not a directory: ${root}`)
      const canonicalRoot = await realpath(root)
      return {
        filename: resolve(canonicalRoot, relative(root, filename)),
        root: canonicalRoot,
        depth,
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = dirname(root)
      if (parent === root) throw error
      root = parent
      depth += 1
    }
  }
}

class Hmr extends Service {
  static inject = ['loader', 'timer']

  baseDir

  internal
  watcher
  configs = new Map()
  configRefreshes = new WeakMap()
  refreshTasks = new Set()

  externals

  accepted

  declined

  stashed = new Set()

  deferredReload = null

  journal = []

  config

  operations = Promise.resolve()

  executing = new AsyncLocalStorage()

  closing = false

  constructor(ctx, config) {
    super(ctx, 'hmr')
    this.config = config
    if (!this.ctx.loader.internal) {
      throw new Error('--expose-internals is required for HMR service')
    }
    this.internal = this.ctx.loader.internal
    this.baseDir = fileURLToPath(new URL(config.base || '.', ctx.baseUrl))
  }

  joinQueue(operation) {
    const run = this.operations.then(operation)
    this.operations = run.then(() => {}, () => {})
    return run
  }

  async runExclusive(operation) {
    if (this.closing) throw new Error('HMR is disposing')
    if (this.executing.getStore() !== undefined) throw new Error('HMR transactions cannot be nested')
    return await this.joinQueue(() => this.executing.run(true, operation))
  }

  async registerConfig(filename, refresh) {
    if (!this.watcher) throw new Error('HMR is not active')
    filename = resolve(this.baseDir, filename)
    const target = await findWatchRoot(filename)
    const watchFilename = target.filename
    if (this.configs.has(watchFilename)) throw new Error(`config path already registered: ${filename}`)

    const { root, depth } = target
    const watcher = watch(root, {
      ...this.config,
      cwd: undefined,
      depth,
      ignored: undefined,
      ignoreInitial: false,
    })
    const registration = { watcher }
    this.configs.set(watchFilename, registration)
    const onChange = (path) => {
      const observed = resolve(path)
      if (observed !== filename && observed !== watchFilename) return
      this.refreshConfig(registration, filename, refresh)
    }
    watcher.on('add', onChange)
    watcher.on('change', onChange)
    watcher.on('unlink', onChange)

    const ready = Promise.withResolvers()
    let readyState = 'pending'
    watcher.once('ready', () => {
      readyState = 'resolved'
      ready.resolve()
    })
    watcher.on('error', (error) => {
      if (readyState === 'pending') {
        readyState = 'rejected'
        ready.reject(error)
      } else {
        this.ctx.logger.warn(error)
      }
    })

    try {
      await ready.promise
      return this.ctx.effect(() => async () => {
        if (this.configs.get(watchFilename) === registration) this.configs.delete(watchFilename)
        await watcher.close()
        await this.configRefreshes.get(registration)?.running
      }, 'hmr.registerConfig()')
    } catch (error) {
      this.configs.delete(watchFilename)
      await watcher.close()
      throw error
    }
  }

  async _resolve(specifier, parentURL, attrs) {
    switch (this.internal.version) {
      case 'v1': return await this.internal.resolve(specifier, parentURL, attrs)
      case 'v2': return this.internal.resolveSync(parentURL, { specifier, attributes: attrs })
    }
  }

  async* [Service.init]() {
    yield async () => {
      this.closing = true
      this.stopDeferring()
      await this.watcher?.close()
      await Promise.allSettled([...this.configs.values()].map(registration => registration.watcher.close()))
      this.configs.clear()
      await Promise.allSettled([...this.refreshTasks])
    }

    const { loader } = this.ctx
    const { root, ignored } = this.config
    if (!this.config.base) {
      this.ctx.logger.info('watching %o', root)
    } else {
      this.ctx.logger.info('watching %o in %s', root, this.baseDir)
    }

    const match = picomatch(ignored)
    const watchBaseDir = await realpath(this.baseDir)

    const mainUrl = pathToFileURL(resolve(process.argv[1])).href
    const mainJob = this.internal.loadCache.get(mainUrl)
    if (mainJob) {
      this.externals = await loadDependencies(mainJob)
    } else {
      this.externals = new Set()
    }

    this.watcher = watch(root, {
      ...this.config,
      cwd: watchBaseDir,
      ignored: path => match(relative(watchBaseDir, path)),
      ignoreInitial: true,
    })

    const reload = () => this.joinQueue(() => this.partialReload())
      .catch(error => this.ctx.logger.warn(error))
    const partialReload = this.ctx.debounce(reload, this.config.debounce)

    const onChange = (kind, path) => {
      this.ctx.logger.debug('%s detected at %C', kind, path)
      const filename = resolve(watchBaseDir, path)
      const configuredFilename = resolve(this.baseDir, path)
      for (const entry of loader.entries()) {
        const include = entry.subtree
        if (include?.filename !== filename && include?.filename !== configuredFilename) continue
        this.refreshConfig(include, include.filename, () => include.refresh())
        return
      }

      if (kind === 'add' && !loader.internal.loadCache.has(pathToFileURL(filename).href)) return
      const url = pathToFileURL(filename).href

      if (this.externals.has(url) || loader.internal.loadCache.has(url)) {
        this.stashed.add(url)
        this.recordJournal({
          kind: this.externals.has(url) ? 'external-change' : 'module-change',
          url,
        })
        return partialReload()
      }

      this.ctx.emit('hmr/change', url)
      this.recordJournal({ kind: 'unhandled-change', url })
    }
    this.watcher.on('add', path => onChange('add', path))
    this.watcher.on('change', path => onChange('change', path))
    this.watcher.on('unlink', path => onChange('unlink', path))

    const ready = Promise.withResolvers()
    let readyState = root.length === 0 ? 'resolved' : 'pending'
    if (root.length === 0) {
      ready.resolve()
    } else {
      this.watcher.once('ready', () => {
        readyState = 'resolved'
        ready.resolve()
      })
    }
    this.watcher.on('error', (error) => {
      if (readyState === 'pending') {
        readyState = 'rejected'
        ready.reject(error)
      } else {
        this.ctx.logger.warn(error)
      }
    })
    await ready.promise
  }

  refreshConfig(key, filename, refresh) {
    const state = this.configRefreshes.get(key) ?? { dirty: false }
    this.configRefreshes.set(key, state)
    state.dirty = true
    if (state.running) return
    const task = (async () => {
      do {
        state.dirty = false
        try {
          await this.joinQueue(refresh)
        } catch (reason) {
          const error = reason instanceof Error ? reason : new Error(String(reason), { cause: reason })
          this.ctx.logger.warn('config reload at %C failed', filename)
          this.ctx.logger.warn(error)
          try {
            await this.ctx.parallel('hmr/config-update-failed', filename, error)
          } catch (rejection) {
            this.ctx.logger.warn(rejection)
          }
        }
      } while (state.dirty)
    })().finally(() => {
      state.running = undefined
      this.refreshTasks.delete(task)
    })
    state.running = task
    this.refreshTasks.add(task)
  }

  getOuterStack = () => [
  ]

  async getLinked(url) {
    const job = this.internal.loadCache.get(url)
    if (!job) return []
    const linked = await job.linked
    return Array.prototype.map.call(linked, (job) => job.url)
  }

  async analyzeChanges() {
    const pending = []
    const queued = new Set()

    this.accepted = new Set(this.stashed)
    this.declined = new Set()

    const isExcluded = (url) => url.startsWith('node:') || url.includes('/node_modules/')

    await Promise.all([...this.stashed].map(async (url) => {
      const children = await this.getLinked(url)
      for (const child of children) {
        if (this.accepted.has(child) || this.declined.has(child) || isExcluded(child)) continue
        queued.add(child)
        pending.push(child)
      }
    }))

    while (pending.length) {
      let index = 0, hasUpdate = false
      while (index < pending.length) {
        const url = pending[index]
        const children = await this.getLinked(url)
        let isDeclined = true, isAccepted = false
        for (const child of children) {
          if (this.declined.has(child) || isExcluded(child)) continue
          if (this.accepted.has(child)) {
            isAccepted = true
            break
          } else {
            isDeclined = false
            if (!queued.has(child)) {
              hasUpdate = true
              queued.add(child)
              pending.push(child)
            }
          }
        }
        if (isAccepted || isDeclined) {
          hasUpdate = true
          pending.splice(index, 1)
          queued.delete(url)
          if (isAccepted) {
            this.accepted.add(url)
          } else {
            this.declined.add(url)
          }
        } else {
          index++
        }
      }
      if (!hasUpdate) break
    }

    for (const url of pending) {
      this.declined.add(url)
    }
  }

  stopDeferring() {
    if (this.deferredReload === null) return
    this.deferredReload()
    this.deferredReload = null
  }

  async partialReload() {
    const busy = await this.ctx.serial('hmr/before-reload')
    if (busy) {
      if (this.deferredReload !== null) return
      const reason = typeof busy === 'string' ? busy : 'work in flight'
      this.ctx.logger.info('reload deferred: %s', reason)
      this.recordJournal({ kind: 'deferred', reason })
      const off = this.ctx.on('hmr/idle', () => {
        this.stopDeferring()
        void reload()
      })
      this.deferredReload = off
      return
    }
    this.stopDeferring()

    await this.analyzeChanges()

    const pending = new Map()
    const reloads = new Map()

    const nameMap = Object.create(null)
    for (const entry of this.ctx.loader.entries()) {
      (nameMap[entry.parent.tree.ctx.baseUrl] ??= new Set()).add(entry.options.name)
    }

    for (const baseUrl in nameMap) {
      for (const name of nameMap[baseUrl]) {
        try {
          const { url } = await this._resolve(name, baseUrl, {})
          if (this.declined.has(url)) continue
          const job = this.internal.loadCache.get(url)
          const plugin = this.ctx.loader.unwrapExports(job?.module?.getNamespace())
          if (!job || !plugin) continue
          pending.set(job, plugin)
          this.declined.add(url)
        } catch (err) {
          this.ctx.logger.warn(err)
        }
      }
    }

    for (const [job, plugin] of pending) {
      this.declined.delete(job.url)
      const dependencies = [...await loadDependencies(job, this.declined)]
      this.declined.add(job.url)

      if (!dependencies.some(dep => this.accepted.has(dep))) continue
      dependencies.forEach(dep => this.accepted.add(dep))

      reloads.set(plugin, {
        filename: job.url,
        runtime: this.ctx.registry.get(plugin),
      })
    }

    const esmBackup = Object.create(null)
    const cjsBackup = Object.create(null)
    const require = createRequire(import.meta.url)
    for (const filename of this.accepted) {
      const job = Map.prototype.get.call(this.internal.loadCache, filename)
      esmBackup[filename] = job
      Map.prototype.delete.call(this.internal.loadCache, filename)

      try {
        const filepath = fileURLToPath(filename)
        if (require.cache[filepath]) {
          cjsBackup[filepath] = require.cache[filepath]
          delete require.cache[filepath]
        }
      } catch {
      }
    }

    const rollback = () => {
      for (const filename in esmBackup) {
        Map.prototype.set.call(this.internal.loadCache, filename, esmBackup[filename])
      }
      for (const filepath in cjsBackup) {
        require.cache[filepath] = cjsBackup[filepath]
      }
    }

    const attempts = {}
    const plugins = [...reloads.values()].map(entry => entry.filename)
    try {
      for (const [, { filename }] of reloads) {
        attempts[filename] = this.ctx.loader.unwrapExports(await this.ctx.loader.import(filename, this.getOuterStack))
      }
    } catch (e) {
      handleError(this.ctx, e)
      this.recordJournal({ kind: 'failed', plugins, reason: e instanceof Error ? e.message : String(e) })
      return rollback()
    }

    const reload = (plugin, runtime) => {
      if (!runtime) return
      for (const oldFiber of runtime.fibers) {
        const fiber = oldFiber.parent.registry.plugin(plugin, oldFiber._config, this.getOuterStack)
        fiber.entry = oldFiber.entry
        if (fiber.entry) fiber.entry.fiber = fiber
      }
    }

    try {
      for (const [plugin, { filename, runtime }] of reloads) {
        if (!runtime) continue
        const path = relative(this.baseDir, fileURLToPath(filename))

        try {
          this.ctx.registry.delete(plugin)
        } catch (err) {
          this.ctx.logger.warn('failed to dispose plugin at %C', path)
          this.ctx.logger.warn(err)
        }

        try {
          reload(attempts[filename], runtime)
          this.ctx.logger.info('reload plugin at %C', path)
        } catch (err) {
          this.ctx.logger.warn('failed to reload plugin at %C', path)
          this.ctx.logger.warn(err)
          throw err
        }
      }
    } catch (e) {
      rollback()
      for (const [plugin, { filename, runtime }] of reloads) {
        if (!runtime) continue
        try {
          this.ctx.registry.delete(attempts[filename])
          reload(plugin, runtime)
        } catch (err) {
          this.ctx.logger.warn(err)
        }
      }
      this.recordJournal({ kind: 'failed', plugins, reason: e instanceof Error ? e.message : String(e) })
      return
    }

    this.ctx.emit('hmr/reload', reloads)
    this.recordJournal({ kind: 'reload', plugins })
    this.stashed = new Set()
  }

  recordJournal(event) {
    const row = { ts: Date.now(), ...event }
    this.journal.push(row)
    if (this.journal.length > 50) this.journal.shift()
    this.ctx.emit('hmr/journal', row)
  }

  snapshot() {
    return {
      deferred: this.deferredReload !== null,
      stashed: [...this.stashed],
      events: this.journal.slice(),
    }
  }

  static Config = z.object({
    base: z.string(),
    root: z.array(String).role('table').default(['.']),
    ignored: z.array(String).role('table').default([
      '**/node_modules',
      '**/.*',
      'cache',
      'data',
    ]),
    usePolling: z.boolean().default(false),
    debounce: z.natural().role('ms').default(100),
  })
}

export default Hmr
