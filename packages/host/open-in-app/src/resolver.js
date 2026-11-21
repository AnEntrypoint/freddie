import { spawn } from '@freddie/freddie-runtime/child-process'
import { readFile, stat } from '@freddie/freddie-runtime/fs-promises'
import { homedir, platform as osPlatform } from '@freddie/freddie-runtime/os'
import { delimiter, dirname, isAbsolute, join } from '@freddie/freddie-runtime/path'
import { runNativeCommand } from '@freddie/freddie-native-command'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'
import { OPEN_IN_APP_CATALOG, PATH_TOKEN } from './catalog.js'
import { process } from '@freddie/freddie-runtime/process'





export async function runHostCommand(command, args, timeoutMs) {
  try {
    const { stdout } = await runNativeCommand(command, [...args], AbortSignal.timeout(timeoutMs))
    return stdout
  } catch {
    return null
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

const launchedThroughSsh = () =>
  (process.env.SSH_CONNECTION ?? '') !== '' || (process.env.SSH_TTY ?? '') !== ''

function expandCandidate(template) {
  let unset = false
  const expanded = template.replace(/\$\{([^}]+)\}/g, (token, name) => {
    const value = process.env[name]
    if (value === undefined) unset = true
    return value ?? token
  })
  if (unset) return null
  return expanded.startsWith('~/') ? join(homedir(), expanded.slice(2)) : expanded
}

async function resolveOnPath(name) {
  if (name.includes('/')) return await isFile(name) ? name : null
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (entry === '') continue
    const candidate = join(entry, name)
    if (await isFile(candidate)) return candidate
  }
  return null
}

function desktopSessionPresent() {
  if (osPlatform() !== 'linux') return true
  return (process.env.DISPLAY ?? '') !== '' || (process.env.WAYLAND_DISPLAY ?? '') !== ''
}

const shellOpenCommand = path => (osPlatform() === 'darwin' ? ['open', [path]] : ['xdg-open', [path]])

function parseDesktopEntry(text) {
  const fields = {}
  let inEntry = false
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[')) {
      inEntry = trimmed === '[Desktop Entry]'
      continue
    }
    if (!inEntry || trimmed === '' || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    fields[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim()
  }
  return { exec: fields.Exec, tryExec: fields.TryExec, icon: fields.Icon }
}

export function xdgDataDirectories() {
  return [
    process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
    ...(process.env.XDG_DATA_DIRS ?? '/usr/local/share:/usr/share').split(':').filter(dir => dir !== ''),
  ]
}

export async function findDesktopEntry(desktopId) {
  for (const dataDir of xdgDataDirectories()) {
    try {
      return parseDesktopEntry(await readFile(join(dataDir, 'applications', `${desktopId}.desktop`), 'utf8'))
    } catch {
      continue
    }
  }
  return null
}

function execCommand(exec) {
  if (exec === undefined) return null
  const quoted = /^"([^"]+)"/.exec(exec)
  if (quoted?.[1] !== undefined) return quoted[1]
  const bare = /^\S+/.exec(exec)
  return bare === null ? null : bare[0]
}

async function desktopLauncher(entry) {
  const candidate = entry.tryExec ?? execCommand(entry.exec)
  if (candidate === null || candidate === '') return null
  if (isAbsolute(candidate)) return await isFile(candidate) ? candidate : null
  return resolveOnPath(candidate)
}

function specFor(app, platform) {
  return platform === 'darwin' || platform === 'linux'
    ? app.platforms[platform]
    : undefined
}

function fixedLocatorWithTrustedIcon(locator) {
  const iconPath = expandCandidate(locator.iconPath)
  if (iconPath === null) return { launch: locator.launch }
  return {
    launch: locator.launch,
    icon: { kind: 'app-bundle', path: iconPath },
  }
}

async function locate(locator, probeTimeoutMs) {
  switch (locator.kind) {
    case 'fixed': {
      return fixedLocatorWithTrustedIcon(locator)
    }
    case 'app': {
      const roots = ['/Applications', join(homedir(), 'Applications')]
      for (const root of roots) {
        for (const fsName of locator.fsNames) {
          const bundle = join(root, fsName)
          if (await isDirectory(bundle)) {
            return {
              launch: { kind: 'argv', command: 'open', args: ['-a', bundle] },
              icon: { kind: 'app-bundle', path: bundle },
            }
          }
        }
      }
      return null
    }
    case 'xcode': {
      const developer = await runHostCommand('xcode-select', ['-p'], probeTimeoutMs)
      if (developer === null) return null
      const bundle = dirname(dirname(developer.trim()))
      if (!bundle.endsWith('.app') || !await isDirectory(bundle)) return null
      const supportedOpenVerb = { kind: 'argv', command: 'xed', args: [] }
      const bundleLaunchWhenCliLostAssociation = { kind: 'argv', command: 'open', args: ['-a', bundle] }
      return {
        launch: supportedOpenVerb,
        fallbackLaunch: bundleLaunchWhenCliLostAssociation,
        icon: { kind: 'app-bundle', path: bundle },
      }
    }
    case 'cli': {
      if (locator.requiresDesktop === true && !desktopSessionPresent()) return null
      const found = await resolveOnPath(locator.name)
      return found === null
        ? null
        : { launch: { kind: 'argv', command: found, args: locator.args } }
    }
    case 'file': {
      for (const candidate of locator.candidates) {
        const path = expandCandidate(candidate)
        if (path !== null && await isFile(path)) {
          return { launch: { kind: 'argv', command: path, args: locator.args } }
        }
      }
      return null
    }
    case 'desktop': {
      const entry = await findDesktopEntry(locator.desktopId)
      if (entry === null) return null
      const launcher = await desktopLauncher(entry)
      return launcher === null ? null : { launch: { kind: 'argv', command: launcher, args: locator.args } }
    }
    default: return null
  }
}

async function resolveApp(app, probeTimeoutMs) {
  const platformSpec = specFor(app, osPlatform())
  if (platformSpec === undefined) return null
  for (const locator of platformSpec.locators) {
    const found = await locate(locator, probeTimeoutMs)
    if (found !== null) return found
  }
  return null
}

export function resolveLaunch(app, probeTimeoutMs) {
  if (launchedThroughSsh()) return Promise.resolve(null)
  return resolveApp(app, probeTimeoutMs)
}

export async function resolveOpenInAppApps(probeTimeoutMs) {
  if (launchedThroughSsh()) return new Map()
  const entries = await Promise.all(OPEN_IN_APP_CATALOG.map(async app =>
    [app.id, await resolveApp(app, probeTimeoutMs)]))
  const map = new Map()
  for (const [id, launch] of entries) {
    if (launch !== null) map.set(id, launch)
  }
  return map
}

const launchDetachedApp = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      detached: true,
      stdio: 'ignore',
      env: scrubbedParentEnv(),
    })
    let settled = false
    const settle = outcome => {
      if (settled) return
      settled = true
      clearTimeout(watch)
      child.unref()
      outcome()
    }
    const watch = setTimeout(() => { settle(resolve) }, options.watchMs)
    child.on('error', error => { settle(() => { reject(error) }) })
    child.on('exit', (code, signalName) => {
      if (code === 0) settle(resolve)
      else settle(() => { reject(new Error(`launcher exited with code ${String(code)}, signal ${String(signalName)}`)) })
    })
  })

const launchArgs = (args, path) => args.some(arg => arg.includes(PATH_TOKEN))
  ? args.map(arg => arg.replaceAll(PATH_TOKEN, path))
  : [...args, path]

const isMissingExecutable = error =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

const ignoreLateOpenerFailure = () => {}

function runShellOpen(path, watchMs) {
  const [command, args] = shellOpenCommand(path)
  const neverAbortedSignal = new AbortController().signal
  const opening = runNativeCommand(command, args, neverAbortedSignal)
  return new Promise(resolve => {
    const watch = setTimeout(() => {
      opening.catch(ignoreLateOpenerFailure)
      resolve('launched')
    }, watchMs)
    opening.then(
      () => {
        clearTimeout(watch)
        resolve('launched')
      },
      error => {
        clearTimeout(watch)
        resolve(isMissingExecutable(error) ? 'missing' : 'failed')
      },
    )
  })
}

async function runLaunch(launch, path, watchMs) {
  if (launch.kind === 'shell-open') return runShellOpen(path, watchMs)
  try {
    await launchDetachedApp(launch.command, launchArgs(launch.args, path), { watchMs })
    return 'launched'
  } catch (error) {
    return isMissingExecutable(error) ? 'missing' : 'failed'
  }
}

export async function launchResolved(resolved, path, watchMs) {
  const primary = await runLaunch(resolved.launch, path, watchMs)
  if (primary === 'launched' || resolved.fallbackLaunch === undefined) return primary
  const fallback = await runLaunch(resolved.fallbackLaunch, path, watchMs)
  if (fallback === 'launched') return 'launched'
  const eitherLauncherVanished = primary === 'missing' || fallback === 'missing'
  return eitherLauncherVanished ? 'missing' : 'failed'
}
