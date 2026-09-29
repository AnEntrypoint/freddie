/**
 * Platform resolution for the open-in-app catalog: each entry's locator chain
 * resolves to a verified launch — a launcher this host actually holds — and one
 * resolution pass yields the map the routes serve and launch from, so a click
 * never re-runs detection. Every locator is a proof obligation: an install
 * record counts only when it names an executable on disk, a bundle only when the
 * directory exists, a `cli` name only when PATH/PATHEXT resolves it.
 *
 * PATH names resolve in-process against THIS host's `PATH`/`PATHEXT` rather than
 * through the `ctx.subprocess` seam, because the applications in the catalog are
 * desktop applications of the machine the operator sits at: that seam resolves
 * inside a provider's execution world, which for a remote provider is the
 * sandbox, not the operator's desktop. The remaining host commands
 * (`xcode-select`, `reg.exe`) run through `freddie-native-command` (argv, never
 * a shell). Applications spawn detached on `scrubbedParentEnv()` — the harness's
 * one credential-scrub definition — so an editor never inherits a provider key;
 * `shell-open` launches (the file managers) go through the OS shell's open verb
 * instead, because a direct `explorer.exe <dir>` spawn does not reliably raise a
 * window.
 * @module @freddie/freddie-host-open-in-app/resolver
 */

import { spawn } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir, platform as osPlatform } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { runNativeCommand } from '@freddie/freddie-native-command'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'
import { OPEN_IN_APP_CATALOG, PATH_TOKEN } from './catalog.js'

/**
 * Where this host holds one resolved application's icon pixels: the `.app`
 * bundle on macOS, the executable Windows extracts the associated icon from.
 * Absent on Linux, where the icon route follows the spec's desktop entry.
 * @typedef {{ readonly kind: 'app-bundle', readonly path: string }
 *   | { readonly kind: 'executable', readonly path: string }} OpenInAppIconSource
 */

/**
 * One entry's verified launchers and icon source on this host.
 * @typedef {{
 *   readonly launch: import('./catalog.js').OpenInAppLaunch,
 *   readonly fallbackLaunch?: import('./catalog.js').OpenInAppLaunch,
 *   readonly icon?: OpenInAppIconSource,
 * }} OpenInAppResolvedLaunch
 */

/**
 * How one launch attempt ended. `missing` marks a stale resolution: the verified
 * launcher is gone, which tells the caller to re-resolve that one entry.
 * @typedef {'launched' | 'missing' | 'failed'} OpenInAppLaunchOutcome
 */

/**
 * Fields of one parsed XDG desktop entry that resolution and the icon route read.
 * @typedef {{ exec?: string, tryExec?: string, icon?: string }} DesktopEntry
 */

/**
 * Run one bounded host command.
 * @param command - executable path or PATH name.
 * @param args - argv (never a shell string).
 * @param timeoutMs - command deadline.
 * @returns stdout on exit 0; null on any failure (spawn, nonzero exit, timeout).
 */
export async function runHostCommand(command, args, timeoutMs) {
  try {
    const { stdout } = await runNativeCommand(command, [...args], AbortSignal.timeout(timeoutMs))
    return stdout
  } catch {
    return null
  }
}

/** @param path - candidate path. @returns true when the path is an existing directory. */
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** @param path - candidate path. @returns true when the path is an existing regular file. */
async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Whether this process was launched through an SSH session. The markers come
 * from the inherited process environment, never from layered configuration, so a
 * deployment cannot talk itself out of the guard and an SSH session that
 * forwards a display is still refused: opening an editor there would target the
 * host, not the machine the browser is on.
 */
const launchedThroughSsh = () =>
  (process.env.SSH_CONNECTION ?? '') !== '' || (process.env.SSH_TTY ?? '') !== ''

/**
 * Expand `${VAR}` references and a leading `~/`. Expansion is string
 * substitution: a candidate keeps its template's `/` separators after the
 * expanded prefix, which Win32 path APIs accept.
 * @param template - candidate template.
 * @returns the expanded candidate, or null when a variable is unset.
 */
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

/** Expand `%VAR%` references in a Windows registry value; null when a variable is unset. */
function expandRegistryValue(value) {
  let unset = false
  const expanded = value.replace(/%([^%]+)%/g, (token, name) => {
    const found = process.env[name]
    if (found === undefined) unset = true
    return found ?? token
  })
  return unset ? null : expanded
}

/**
 * Executable suffixes a bare command name may carry, in the host's own
 * precedence order (`PATHEXT` on Windows, where cmd.exe's order is the
 * authority; no suffix at all elsewhere).
 */
const PATH_EXTENSIONS = osPlatform() === 'win32'
  ? ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(entry => entry !== '')
    .map(entry => entry.toLowerCase())]
  : ['']

/**
 * Resolve one command name through this host's PATH in-process.
 * @param name - bare command name, or a path (separators present).
 * @returns the verified executable path, or null when nothing on PATH proves one.
 */
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

/**
 * Whether a desktop session this process could open a native window in is
 * announced. macOS and Windows always carry one; a headless or containerised
 * Linux host does not, which is what keeps a `xdg-open` entry off the list
 * instead of offering a button that spawns it into nothing.
 */
function desktopSessionPresent() {
  if (osPlatform() !== 'linux') return true
  return (process.env.DISPLAY ?? '') !== '' || (process.env.WAYLAND_DISPLAY ?? '') !== ''
}

/** PowerShell single-quoted literal (doubles embedded quotes). */
const powershellLiteral = path => `'${path.replace(/'/g, "''")}'`

/** The OS shell's open verb for one directory, per platform. */
const shellOpenCommand = path => {
  if (osPlatform() === 'darwin') return ['open', [path]]
  if (osPlatform() === 'win32') {
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Invoke-Item -LiteralPath ${powershellLiteral(path)}`]]
  }
  return ['xdg-open', [path]]
}

/** `App Paths` roots, user hive first (per-user installs shadow machine ones). */
const APP_PATHS_ROOTS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
]

/** Uninstall-record roots: user hive, 64-bit machine hive, 32-bit machine view. */
const UNINSTALL_ROOTS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
]

/**
 * Windows registry facts for one resolution pass: the lower-cased `App Paths`
 * executable names and the parsed Uninstall records.
 * @typedef {{
 *   readonly appPaths: ReadonlyMap<string, string>,
 *   readonly installRecords: readonly { displayName: string, installLocation?: string, displayIcon?: string }[],
 * }} WindowsRegistryView
 */

/**
 * Parse `reg.exe query <root> /s` output into per-subkey string values.
 * `reg.exe` prints one key path line per subkey followed by indented value
 * lines; the value-name/type/data columns are matched by the `REG_*` type token
 * because the default-value marker localizes with the operating system language.
 * @param dump - raw `reg.exe` stdout.
 * @returns subkey path to its `REG_SZ`/`REG_EXPAND_SZ` values by value name
 *   (the default value under `(Default)` regardless of locale).
 */
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

/** Every locale wraps the default-value marker in parentheses, so one parser serves localized hosts. */
const isParenthesizedDefaultMarker = name => /^\(.*\)$/.test(name)

/** Registry keys separate with a backslash on every host, so `path.basename` would be wrong. */
const registeredNameOf = key => key.slice(key.lastIndexOf('\\') + 1).toLowerCase()

/**
 * Build the Windows registry facts for one resolution pass, one `reg.exe query
 * /s` per root — batched because a per-entry `reg.exe` would cost one process
 * per catalog row. A root that fails or is absent contributes nothing.
 * @param timeoutMs - per-`reg.exe` deadline.
 * @returns the parsed view.
 */
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

/** Pass-scoped memo so one resolution pass reads the registry at most once. */
const registryViewOnce = timeoutMs => {
  let view
  return () => (view ??= readWindowsRegistryView(timeoutMs))
}

/** `DisplayIcon` may carry a `,<index>` suffix and quotes around the path. */
const withoutIconIndexAndQuotes = displayIcon =>
  displayIcon.replace(/,-?\d+$/, '').replace(/^"|"$/g, '').trim()

/**
 * The executable a Windows Uninstall record proves, or null when it proves
 * none. A record alone is an uninstaller's bookkeeping, not a launcher: the
 * install directory it names may have been deleted by anything but its
 * uninstaller, which is why an unverified record never reaches the map.
 */
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

/** Parse the `[Desktop Entry]` section's `Exec`/`TryExec`/`Icon` keys. */
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

/**
 * XDG data directories in precedence order (`XDG_DATA_HOME`, then
 * `XDG_DATA_DIRS` with the freedesktop defaults).
 * @returns the data directories.
 */
export function xdgDataDirectories() {
  return [
    process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
    ...(process.env.XDG_DATA_DIRS ?? '/usr/local/share:/usr/share').split(':').filter(dir => dir !== ''),
  ]
}

/**
 * Read one desktop entry by id from the XDG application directories.
 * @param desktopId - entry id without the `.desktop` suffix.
 * @returns the parsed entry, or null when no directory holds it.
 */
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

/**
 * First token of an `Exec=` value.
 * @param exec - the raw `Exec=` value, when the entry carries one.
 * @returns the quoted path or the run up to whitespace; null when absent or blank.
 */
function execCommand(exec) {
  if (exec === undefined) return null
  const quoted = /^"([^"]+)"/.exec(exec)
  if (quoted?.[1] !== undefined) return quoted[1]
  const bare = /^\S+/.exec(exec)
  return bare === null ? null : bare[0]
}

/**
 * The executable one desktop entry proves: a `TryExec` when present, otherwise
 * `Exec`'s first token. Absolute paths verify on disk; bare names go through
 * PATH, because a desktop entry's `Exec` is written for a shell's lookup.
 */
async function desktopLauncher(entry) {
  const candidate = entry.tryExec ?? execCommand(entry.exec)
  if (candidate === null || candidate === '') return null
  if (isAbsolute(candidate)) return await isFile(candidate) ? candidate : null
  return resolveOnPath(candidate)
}

/** The catalog entry's spec for one platform; undefined off the declared three. */
function specFor(app, platform) {
  return platform === 'darwin' || platform === 'win32' || platform === 'linux'
    ? app.platforms[platform]
    : undefined
}

/** Icon source for a resolved executable: Windows extracts from the binary itself. */
const executableIcon = path => (osPlatform() === 'win32' ? { kind: 'executable', path } : undefined)

/** Version-suffixed directory names compare numeric-aware, newest first ('2024.1.10' outranks '2024.1.9'). */
const newestVersionFirst = (a, b) => b.localeCompare(a, 'en', { numeric: true })

/** An OS-shipped entry's icon path is trusted, not probed; only an unset variable drops the icon claim. */
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

/**
 * Resolve one locator to a verified launch, or null when it proves nothing.
 * @param locator - the catalog's locator.
 * @param probeTimeoutMs - deadline for the resolution host commands it runs.
 * @param registry - the pass's memoized registry view.
 */
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

/** Resolve one entry against a pass-shared registry view. */
async function resolveWithRegistry(app, probeTimeoutMs, registry) {
  const platformSpec = specFor(app, osPlatform())
  if (platformSpec === undefined) return null
  for (const locator of platformSpec.locators) {
    const found = await locate(locator, probeTimeoutMs, registry)
    if (found !== null) return found
  }
  return null
}

/**
 * Resolve one catalog entry on this host.
 * @param app - catalog entry.
 * @param probeTimeoutMs - deadline for the resolution host commands.
 * @returns the verified launch, or null over SSH or when nothing proves one.
 */
export function resolveLaunch(app, probeTimeoutMs) {
  if (launchedThroughSsh()) return Promise.resolve(null)
  return resolveWithRegistry(app, probeTimeoutMs, registryViewOnce(probeTimeoutMs))
}

/**
 * Resolve the whole catalog once: every entry's verified launcher on this host,
 * in menu order. The Windows registry is read at most once per pass. The
 * returned map is the mutable authority the caller owns — the routes serve its
 * keys and launch from its values, and a stale entry is replaced or removed in
 * place after an ENOENT launch. An SSH launch returns an empty map without
 * probing, so the offer disappears rather than opening an editor on the wrong
 * machine.
 * @param probeTimeoutMs - deadline for the resolution host commands.
 * @returns catalog id to verified launch, in catalog order.
 */
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

/**
 * Launch one application adapter detached from this process: the child gets a
 * credential-scrubbed environment plus the adapter's explicit entries, holds no
 * stdio pipe, and outlives freddie. Windows GUI processes remain visible unless
 * the adapter explicitly hides its own CLI process.
 *
 * Launch success is decoupled from process exit: launchers such as kitty or the
 * JetBrains IDEs stay in the foreground for their whole window lifetime, so the
 * watch window only catches launchers that fail immediately — a child still
 * running when it closes is unrefed and counted launched, never killed.
 * @param command - executable path.
 * @param args - argv (never a shell string).
 * @param options - watch window and adapter process options.
 * @returns after the launch is counted successful; rejects on early failure.
 */
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

/** Substitute the directory token into one launch argv, appending the directory when no arg carries one. */
const launchArgs = (args, path) => args.some(arg => arg.includes(PATH_TOKEN))
  ? args.map(arg => arg.replaceAll(PATH_TOKEN, path))
  : [...args, path]

/** Whether a launch rejection names a missing executable (a stale resolution). */
const isMissingExecutable = error =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

const ignoreLateOpenerFailure = () => {}

/**
 * Open one directory through the OS shell's open verb under the launch watch
 * window: the opener completing inside the window decides the outcome, and an
 * opener still running when it closes counts as launched and keeps running (a
 * cold shell opener can outlive the window; its late settlement is swallowed
 * because the request already answered).
 */
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

/** Run one launcher and classify how the attempt ended. */
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

/**
 * Launch one resolved application on a directory: the primary launcher, then the
 * fallback when the primary fails inside the watch window.
 * @param resolved - the entry's verified launchers.
 * @param path - absolute workspace directory (already validated by the route).
 * @param watchMs - early-failure watch window per launcher.
 * @returns how the attempt ended; `missing` when a tried launcher's executable
 *   is gone, which tells the caller to re-resolve once.
 */
export async function launchResolved(resolved, path, watchMs) {
  const primary = await runLaunch(resolved.launch, path, watchMs)
  if (primary === 'launched' || resolved.fallbackLaunch === undefined) return primary
  const fallback = await runLaunch(resolved.fallbackLaunch, path, watchMs)
  if (fallback === 'launched') return 'launched'
  const eitherLauncherVanished = primary === 'missing' || fallback === 'missing'
  return eitherLauncherVanished ? 'missing' : 'failed'
}
