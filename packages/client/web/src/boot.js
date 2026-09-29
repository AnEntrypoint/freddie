import { Context, Logger } from '@freddie/cordis'
import Loader from '@freddie/cordis-plugin-loader'
import { BootPage } from './boot-page.js'
import { getStaticModules } from './seed.js'
import { FIBER_STATE, STATE_LABELS } from './loader-status.js'

function preinjectedTransport() {
  return globalThis.__FREDDIE_TRANSPORT__
}

const leavePrefetchFailureToLoaderImport = () => {}

const CONSOLE_LOG_TYPES = new Set(['error', 'warn'])

const SETTLE_QUIET_TICKS = 3

const errorText = error => error instanceof Error ? error.message : String(error)

const sleep = ms => new Promise((resolve) => { setTimeout(resolve, ms) })

function exportLoggerToConsole(ctx) {
  const exporter = {
    levels: { default: 2 },
    export: (message) => {
      if (CONSOLE_LOG_TYPES.has(message.type)) console[message.type](`[${message.name}] ${Logger.format(exporter, message)}`)
    },
  }
  ctx.logger.exporter(exporter)
}

export class AppWebEntry {
  container
  seams
  page
  ctx
  modules
  manifest
  mounted
  booted
  bootFailure

  constructor(container, seams) {
    this.container = container
    this.seams = seams
    this.page = new BootPage(container)
    this.booted = new Promise((resolve) => { this.markBooted = resolve })
  }

  async run() {
    try {
      const win = globalThis
      if (win.__FREDDIE_BOOT__ === undefined) {
        throw new Error('web boot: window.__FREDDIE_BOOT__ boot graph is missing')
      }
      const transport = preinjectedTransport()
      const { createClientModuleSystem } = await import('@freddie/freddie-client-modules/client')
      this.modules = createClientModuleSystem({
        boot: win.__FREDDIE_BOOT__,
        staticModules: this.seams?.staticModules ?? getStaticModules(),
        ...transport?.importModule === undefined ? {} : { importModule: transport.importModule },
        ...this.seams?.importModule === undefined ? {} : { importModule: this.seams.importModule },
      })
      this.manifest = this.modules.manifest

      const prefetching = this.prefetchImmediateTier()
      const ctx = new Context()
      this.ctx = ctx
      exportLoggerToConsole(ctx)
      await this.runPluginBoot(ctx, prefetching)
      await this.mountApp(ctx)
    } catch (reason) {
      console.error(reason)
      this.bootFailure = errorText(reason)
      this.page.fail(this.bootFailure)
    } finally {
      this.markBooted()
    }
  }

  async dispose() {
    const ctx = this.ctx
    this.ctx = undefined
    if (ctx !== undefined) await ctx.fiber.dispose()
    this.page.dispose()
    this.container.replaceChildren()
  }

  async mountApp(ctx) {
    this.mounted = ctx.inject(['uiRenderer'], (scope) => {
      try {
        scope.effect(() => scope.uiRenderer.mount(this.container), 'web boot: application mount')
      } catch (reason) {
        console.error(reason)
        this.presentFailure('The application could not render', errorText(reason))
        throw reason
      }
    })
    await this.mounted
  }

  presentFailure(title, message, notice) {
    this.page.fail(notice === undefined ? message : `${message}\n${notice}`, { title, action: 'Reload' })
    this.page.attach(this.container)
  }

  async settled(timeoutMs) {
    const deadline = performance.now() + timeoutMs
    let quiet = 0
    while (quiet < SETTLE_QUIET_TICKS && performance.now() < deadline) {
      const pending = this.coreFibers().filter(fiber => fiber.inertia !== undefined).map(fiber => fiber.inertia)
      if (pending.length === 0) {
        quiet += 1
        await sleep(0)
        continue
      }
      quiet = 0
      await Promise.race([Promise.allSettled(pending), sleep(deadline - performance.now())])
    }
  }

  coreFibers() {
    const fibers = this.coreEntries(this.ctx).map(entry => entry.fiber).filter(fiber => fiber !== undefined)
    if (this.mounted !== undefined) fibers.push(this.mounted)
    return fibers
  }

  async health(timeoutMs = 10_000) {
    if (this.bootFailure !== undefined) return this.bootFailure
    if (this.ctx === undefined) return 'web boot: the client tree is not running'
    await this.settled(timeoutMs)
    const failures = this.entryFailures(this.ctx)
    if (failures.length > 0) return this.describeFailures(failures)
    return await this.mountFailure()
  }

  async mountFailure() {
    if (this.mounted === undefined) return 'web boot: the application mount was never started'
    try {
      await this.mounted.await()
    } catch (reason) {
      return `web boot: the application mount failed: ${errorText(reason)}`
    }
    if (this.mounted.state !== FIBER_STATE.ACTIVE) return 'web boot: the application mount is waiting for the UI renderer'
    this.page.withdraw()
    if (this.container.childElementCount === 0) return 'web boot: the application root rendered no content'
    return undefined
  }

  async prefetchImmediateTier() {
    const transportOwnsBundleBytes = preinjectedTransport()?.loadBundle !== undefined
    if (transportOwnsBundleBytes) return
    await Promise.all(this.manifest.plugins
      .filter(row => row.immediately)
      .map(row => this.modules.prefetch(row.id).catch(leavePrefetchFailureToLoaderImport)))
  }

  async runPluginBoot(ctx, prefetching) {
    await ctx.plugin(Loader)
    const loader = ctx.loader
    loader.internal = this.modules

    ctx.on('internal/status', (fiber) => {
      const entry = fiber.entry
      if (entry === undefined || entry.fiber === undefined || !this.coreEntries(ctx).includes(entry)) return
      const state = STATE_LABELS[entry.fiber.state]
      this.page.setState(entry.options.name, state)
      this.page.setCurrent(state === 'active' || state === 'failed' ? undefined : entry.options.name)
    })

    const rows = this.manifest.plugins.map(row => row.id)
    this.page.setTotal(rows.length)
    await prefetching
    await Promise.all(rows.map(async (name) => {
      this.page.setState(name, 'loading')
      this.page.setCurrent(name)
      const id = await loader.create({ name })
      if (loader.resolve(id).fiber === undefined) this.page.setState(name, 'failed')
    }))

    await loader.await()
    this.assertEntriesActive(ctx)
  }

  assertEntriesActive(ctx) {
    const failures = this.entryFailures(ctx)
    if (failures.length > 0) throw new Error(this.describeFailures(failures))
  }

  coreEntries(ctx) {
    const roster = new Set(this.manifest.plugins.map(row => row.id))
    return [...ctx.loader.entries()].filter(entry => roster.has(entry.options.name))
  }

  describeFailures(failures) {
    return `web boot: ${String(failures.length)} entr${failures.length === 1 ? 'y' : 'ies'} did not activate\n${failures.join('\n')}`
  }

  entryFailures(ctx) {
    const failures = []
    for (const entry of this.coreEntries(ctx)) {
      const name = entry.options.name
      if (entry.fiber === undefined) {
        failures.push(`${name}: import failed (see console for the import error)`)
        continue
      }
      const state = STATE_LABELS[entry.fiber.state]
      if (state === 'active') continue
      if (state === 'pending') {
        const missing = Object.keys(entry.fiber.inject).filter(service => ctx.get(service) === undefined)
        failures.push(`${name}: pending (waiting for service${missing.length === 1 ? '' : 's'}: ${missing.join(', ') || 'unknown'})`)
      } else {
        const reason = entry.fiber._error
        failures.push(reason === undefined ? `${name}: ${state}` : `${name}: ${state}: ${errorText(reason)}`)
      }
    }
    return failures
  }
}
