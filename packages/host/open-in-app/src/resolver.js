import { spawn } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir, platform as osPlatform } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { runNativeCommand } from '@freddie/freddie-native-command'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'
import { OPEN_IN_APP_CATALOG, PATH_TOKEN } from './catalog.js'





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

function expandRegistryValue(value) {
  let unset = false
  const expanded = value.replace(/%([^%]+)%/g, (token, name) => {
    const found = process.env[name]
    if (found === undefined) unset = true
    return found ?? token
  })
  return unset ? null : expanded
}

const PATH_EXTENSIONS = osPlatform() === 'win32'
  ? ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(entry => entry !== '')
    .map(entry => entry.toLowerCase())]
  : ['']

async function resolveOnPath(name) {
  if (name.includes('/') || name.includes('\\')) return await isFile(name) ? name : null
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (entry === '') continue
    for (const extension of PATH_EXTENSIONS) {
      const candidate = join(entry, `${name}${extension}`)
      if (await isFile(candidate)) return candidate
    }
  }
  return null
}

function desktopSessionPresent() {
  if (osPlatform() !== 'linux') return true
  return (process.env.DISPLAY ?? '') !== '' || (process.env.WAYLAND_DISPLAY ?? '') !== ''
}

const powershellLiteral = path => `'${path.replace(/'/g, "''")}'`

const shellOpenCommand = path => {
  if (osPlatform() === 'darwin') return ['open', [path]]
  if (osPlatform() === 'win32') {
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Invoke-Item -LiteralPath ${powershellLiteral(path)}`]]
  }
  return ['xdg-open', [path]]
}

const APP_PATHS_ROOTS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
]

const UNINSTALL_ROOTS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
]


function parseRegistryDump(dump) {
  const keys = new Map()
  let current
  for (const line of dump.split(/\r?\n/)) {
    if (/^HK/.test(line)) {
      current = new Map()
      keys.set(line.trim(), current)
      continue
    }
    const value = /^\s+(.*?)\s+(REG_SZ|REG_EXPAND_SZ)\s+(.*)$/.exec(line)
    if (value === null || current === undefined) continue
    current.set(isParenthesizedDefaultMarker(value[1]) ? '(Default)' : value[1], value[3].trim())
  }
  return keys
}

const isParenthesizedDefaultMarker = name => /^\(.*\)$/.test(name)

const registeredNameOf = key => key.slice(key.lastIndexOf('\\') + 1).toLowerCase()

async function readWindowsRegistryView(timeoutMs) {
  const appPaths = new Map()
  const installRecords = []
  for (const root of APP_PATHS_ROOTS) {
    const dump = await runHostCommand('reg.exe', ['query', root, '/s'], timeoutMs)
    if (dump === null) continue
    for (const [key, values] of parseRegistryDump(dump)) {
      const exe = registeredNameOf(key)
      const target = values.get('(Default)')
      if (!exe.endsWith('.exe') || target === undefined || appPaths.has(exe)) continue
      const expanded = expandRegistryValue(target.replace(/^"|"$/g, ''))
      if (expanded !== null) appPaths.set(exe, expanded)
    }
  }
  for (const root of UNINSTALL_ROOTS) {
    const dump = await runHostCommand('reg.exe', ['query', root, '/s'], timeoutMs)
    if (dump === null) continue
    for (const values of parseRegistryDump(dump).values()) {
      const displayName = values.get('DisplayName')
      if (displayName === undefined) continue
      installRecords.push({
        displayName,
        installLocation: values.get('InstallLocation'),
        displayIcon: values.get('DisplayIcon'),
      })
    }
  }
  return { appPaths, installRecords }
}

const registryViewOnce = timeoutMs => {
  let view
  return () => (view ??= readWindowsRegistryView(timeoutMs))
}

const withoutIconIndexAndQuotes = displayIcon =>
  displayIcon.replace(/,-?\d+$/, '').replace(/^"|"$/g, '').trim()

async function recordLauncher(record, relativeLauncher) {
  if (relativeLauncher !== undefined && (record.installLocation ?? '') !== '') {
    const expanded = expandRegistryValue(record.installLocation.replace(/^"|"$/g, ''))
    if (expanded !== null) {
      const candidate = join(expanded, relativeLauncher)
      if (await isFile(candidate)) return candidate
    }
  }
  if (record.displayIcon === undefined) return null
  const expanded = expandRegistryValue(withoutIconIndexAndQuotes(record.displayIcon))
  if (expanded === null || !expanded.toLowerCase().endsWith('.exe')) return null
  return await isFile(expanded) ? expanded : null
}

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
  return platform === 'darwin' || platform === 'win32' || platform === 'linux'
    ? app.platforms[platform]
    : undefined
}

const executableIcon = path => (osPlatform() === 'win32' ? { kind: 'executable', path } : undefined)

const newestVersionFirst = (a, b) => b.localeCompare(a, 'en', { numeric: true })

function fixedLocatorWithTrustedIcon(locator) {
  const iconPath = expandCandidate(locator.iconPath)
  if (iconPath === null) return { launch: locator.launch }
  return {
    launch: locator.launch,
    icon: osPlatform() === 'win32'
      ? { kind: 'executable', path: iconPath }
      : { kind: 'app-bundle', path: iconPath },
  }
}

async function locate(locator, probeTimeoutMs, registry) {
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
        : { launch: { kind: 'argv', command: found, args: locator.args }, icon: executableIcon(found) }
    }
    case 'file': {
      for (const candidate of locator.candidates) {
        const path = expandCandidate(candidate)
        if (path !== null && await isFile(path)) {
          return { launch: { kind: 'argv', command: path, args: locator.args }, icon: executableIcon(path) }
        }
      }
      return null
    }
    case 'scan': {
      const root = expandCandidate(locator.root)
      if (root === null) return null
      let entries
      try {
        entries = await readdir(root)
      } catch {
        return null
      }
      const versions = entries.filter(entry => entry.startsWith(locator.namePrefix))
        .sort(newestVersionFirst)
      for (const version of versions) {
        const launcher = join(root, version, locator.relativeLauncher)
        if (await isFile(launcher)) {
          return { launch: { kind: 'argv', command: launcher, args: locator.args }, icon: executableIcon(launcher) }
        }
      }
      return null
    }
    case 'app-paths': {
      const target = (await registry()).appPaths.get(locator.exe.toLowerCase())
      if (target === undefined || !await isFile(target)) return null
      return { launch: { kind: 'argv', command: target, args: locator.args }, icon: { kind: 'executable', path: target } }
    }
    case 'install-record': {
      for (const record of (await registry()).installRecords) {
        if (!record.displayName.startsWith(locator.displayNamePrefix)) continue
        const launcher = await recordLauncher(record, locator.relativeLauncher)
        if (launcher !== null) {
          return { launch: { kind: 'argv', command: launcher, args: locator.args }, icon: { kind: 'executable', path: launcher } }
        }
      }
      return null
    }
    case 'github-desktop': {
      const root = expandCandidate(locator.root)
      if (root === null) return null
      let versions
      try {
        versions = (await readdir(root))
          .filter(entry => entry.startsWith('app-'))
          .sort(newestVersionFirst)
      } catch {
        return null
      }
      for (const version of versions) {
        const directory = join(root, version)
        const executable = join(directory, 'GitHubDesktop.exe')
        const cli = join(directory, 'resources', 'app', 'cli.js')
        if (await isFile(executable) && await isFile(cli)) {
          const githubOpenVerbViaPackagedCliRunAsNodeWithHiddenAdapter = {
            kind: 'argv',
            command: executable,
            args: [cli, 'open'],
            env: { ELECTRON_RUN_AS_NODE: '1' },
            windowsHide: true,
          }
          return {
            launch: githubOpenVerbViaPackagedCliRunAsNodeWithHiddenAdapter,
            icon: { kind: 'executable', path: executable },
          }
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

async function resolveWithRegistry(app, probeTimeoutMs, registry) {
  const platformSpec = specFor(app, osPlatform())
  if (platformSpec === undefined) return null
  for (const locator of platformSpec.locators) {
    const found = await locate(locator, probeTimeoutMs, registry)
    if (found !== null) return found
  }
  return null
}

export function resolveLaunch(app, probeTimeoutMs) {
  if (launchedThroughSsh()) return Promise.resolve(null)
  return resolveWithRegistry(app, probeTimeoutMs, registryViewOnce(probeTimeoutMs))
}

export async function resolveOpenInAppApps(probeTimeoutMs) {
  if (launchedThroughSsh()) return new Map()
  const registry = registryViewOnce(probeTimeoutMs)
  const entries = await Promise.all(OPEN_IN_APP_CATALOG.map(async app =>
    [app.id, await resolveWithRegistry(app, probeTimeoutMs, registry)]))
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
      windowsHide: options.windowsHide,
      env: { ...scrubbedParentEnv(), ...options.env },
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
    await launchDetachedApp(launch.command, launchArgs(launch.args, path), {
      watchMs,
      ...(launch.env === undefined ? {} : { env: launch.env }),
      ...(launch.windowsHide === undefined ? {} : { windowsHide: launch.windowsHide }),
    })
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
