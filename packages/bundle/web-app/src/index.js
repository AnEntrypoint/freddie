
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import z from '@freddie/schemastery'
import { addHarnessSourceSection } from '@freddie/freddie-app-boot'
import * as FrontendStatic from '@freddie/freddie-host-frontend-static'
import { launchEnvironmentOf } from '@freddie/freddie-launch-environment'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'

export const name = 'web-app'

const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

const WEB_RUNTIME_SERVICE = 'webRuntime'

export const inject = ['webServer']

export const Config = z.object({
  openBrowser: z.boolean().default(true),
  printUrl: z.boolean().default(true),
  surfaceContext: z.boolean().default(true),
  trustedHosts: z.array(String).default([]),
})

const FREDDIE_WEB_URL = 'FREDDIE_WEB_URL'

const DISPLAYED_LOOPBACK_HOST = '127.0.0.1'
const ALL_INTERFACES_HOST = '0.0.0.0'

function launchedThroughSsh(ctx) {
  const environment = launchEnvironmentOf(ctx)
  return ['SSH_CONNECTION', 'SSH_TTY'].some((name) => {
    const value = environment.getFrom(name, ['process'])?.value
    return value !== undefined && value !== ''
  })
}

function browserSharesThisHost(ctx) {
  return !launchedThroughSsh(ctx)
}

const BROWSER_OPENER_MODULE = import.meta.resolve('open')

const BROWSER_OPENER_PROGRAM = `
try {
  const { default: open } = await import(${JSON.stringify(BROWSER_OPENER_MODULE)})
  const launcher = await open(process.argv[1])
  if (process.platform === 'win32') {
    const code = launcher.exitCode ?? await new Promise((resolve, reject) => {
      function onError(error) {
        launcher.off('close', onClose)
        reject(error)
      }
      function onClose(code) {
        launcher.off('error', onError)
        resolve(code)
      }
      launcher.ref()
      launcher.once('error', onError)
      launcher.once('close', onClose)
    })
    if (code !== 0) throw new Error('browser operating-system launcher exited with code ' + String(code))
  }
  process.exitCode = 0
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
`

export function resolveLanTrust(bindHost, extra) {
  const lanAddresses = bindHost === ALL_INTERFACES_HOST
    ? Object.values(networkInterfaces()).flat()
      .filter((iface) => iface !== undefined && iface.family === 'IPv4' && !iface.internal)
      .map(iface => iface.address)
    : []
  return { lanAddresses, trustedHosts: [...lanAddresses, ...extra] }
}

function webSurfacePrompt(webUrl) {
  const updateContract = 'Client-plugin changes reload without a refresh automatically: every package is served unbundled '
    + 'straight from its own source tree, and the HMR receiver reloads a plugin the moment its served files change — no '
    + 'separate watcher process or rebuild step is needed. '
    + 'apps/web itself (the shell and plain packages) is also served buildless, straight from source; a shell change still '
    + 'requires a page refresh to take effect, since the shell boots once rather than hot-swapping. '
  return `You are interacting with the user through the Freddie Web GUI at ${webUrl}. `
    + 'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. '
    + 'The browser provides no implicit DOM, route, or screenshot context. '
    + updateContract
    + 'Starting another server does not update this GUI. '
    + 'The apps/web entry is not a standalone application because only freddie web injects window.__FREDDIE_BOOT__. '
    + 'Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.'
}

function localWebUrl(ctx) {
  const port = ctx.get('webServer')?.port
  if (port === undefined) throw new Error('web-app: webServer service missing while resolving Web runtime')
  return `http://${DISPLAYED_LOOPBACK_HOST}:${String(port)}`
}

function resolveDistIndex() {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@freddie/freddie-web-frontend/index.html')
  } catch {
    throw new Error('web-app: apps/web/index.html not found; check out the repository root first')
  }
}

function spawnBrowserLauncher(url) {
  return spawn(process.execPath, [
    '--input-type=module',
    '--eval', BROWSER_OPENER_PROGRAM,
    '--', url,
  ], {
    env: scrubbedParentEnv(),
    stdio: ['ignore', 'inherit', 'pipe'],
  })
}

async function openBrowser(url) {
  const launcher = spawnBrowserLauncher(url)
  let launcherStderr = ''
  launcher.stderr?.setEncoding('utf8')
  launcher.stderr?.on('data', (chunk) => { launcherStderr += chunk })
  await new Promise((resolve, reject) => {
    function onError(error) {
      launcher.off('close', onClose)
      reject(error)
    }
    function onClose(code) {
      launcher.off('error', onError)
      if (code !== 0) {
        const firstLine = launcherStderr.trim().split(/\r?\n/u)[0]
        const reason = firstLine === undefined || firstLine === ''
          ? `browser launcher exited with code ${String(code)}`
          : firstLine.replace(/^(?:[A-Za-z]*Error):\s*/u, '')
        reject(new Error(reason))
        return
      }
      if (launcherStderr !== '') process.stderr.write(launcherStderr)
      resolve()
    }
    launcher.once('error', onError)
    launcher.once('close', onClose)
  })
}

const stayQuietBecauseLoaderReportsFailedBoot = () => {}

function announceWhenTreeSettled(ctx, announce) {
  const settled = ctx.get('loader')?.await()
  if (settled === undefined) {
    announce()
    return
  }
  void settled.then(() => {
    const treeDisposedDuringBoot = ctx.get('webServer') === undefined
    if (!treeDisposedDuringBoot) announce()
  }, stayQuietBecauseLoaderReportsFailedBoot)
}

export const internals = { resolveDistIndex, openBrowser }

export function apply(ctx, config) {
  const runtime = resolveLanTrust(ctx.webServer.host, config.trustedHosts)
  const handoffBrowser = config.openBrowser && browserSharesThisHost(ctx)
  ctx.provide(WEB_RUNTIME_SERVICE, runtime)
  ctx.plugin(FrontendStatic, { distIndex: internals.resolveDistIndex() })
  if (config.surfaceContext) {
    ctx.inject(['systemPrompt'], (promptCtx) => {
      addHarnessSourceSection(promptCtx, SOURCE_ROOT)
      promptCtx.systemPrompt.section({
        name: 'app:web-surface',
        order: -98,
        text: () => webSurfacePrompt(localWebUrl(promptCtx)),
      })
    })
    ctx.inject(['shellEnv'], (runtimeCtx) => {
      runtimeCtx.shellEnv.register({
        name: 'web-runtime',
        variables: {
          [FREDDIE_WEB_URL]: { description: 'Canonical local URL of the Freddie Web GUI serving this session.' },
        },
        resolve: () => ({ [FREDDIE_WEB_URL]: localWebUrl(runtimeCtx) }),
      })
    })
  }
  if (config.printUrl || handoffBrowser) {
    const announceReady = () => {
      const webUrl = localWebUrl(ctx)
      const trustFenceLanAddress = runtime.lanAddresses[0]
      const port = ctx.webServer.port
      if (config.printUrl) {
        console.log(`freddie web: ${webUrl}${trustFenceLanAddress === undefined ? '' : ` (LAN: http://${trustFenceLanAddress}:${String(port)})`}`)
      }
      if (handoffBrowser) {
        console.log('freddie web: opening the default browser; pass --no-open to disable')
        void internals.openBrowser(webUrl).catch((error) => {
          const reason = error instanceof Error ? error.message : String(error)
          console.error(`web-app: could not open the default browser because ${reason}; visit ${webUrl} manually`)
        })
      }
    }
    announceWhenTreeSettled(ctx, announceReady)
  }
}
