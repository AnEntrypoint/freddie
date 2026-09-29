/**
 * Host icon extraction for resolved open-in-app applications, one strategy per
 * platform: macOS converts the resolved bundle's `.icns` to a 128px PNG
 * (`plutil` + `sips`); Windows extracts the resolved executable's associated
 * icon as a 32px PNG through a generated PowerShell script; Linux follows the
 * spec's desktop entry `Icon=` key into the hicolor theme and pixmaps
 * directories (PNG or SVG, no subprocess). Every failure resolves null and the
 * icon route answers 404, which a browser surface renders as a generic glyph —
 * no placeholder artwork ships, because a wrong icon reads as a wrong
 * application.
 * @module @freddie/freddie-host-open-in-app/icons
 */

import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { platform as osPlatform, tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { findDesktopEntry, runHostCommand, xdgDataDirectories } from './resolver.js'

/**
 * One extracted icon: raw bytes plus the media type the route serves.
 * @typedef {{ readonly bytes: Buffer, readonly contentType: 'image/png' | 'image/svg+xml' }} OpenInAppIcon
 */

/** Hicolor theme sizes in descending preference; `scalable` carries the SVGs. */
const HICOLOR_DIRECTORIES = [
  '256x256', '128x128', '96x96', '72x72', '64x64', '48x48', '32x32', '24x24', '22x22', '16x16',
  'scalable',
]

/** Media type of an icon file by its extension; anything else is not served. */
const contentTypeOf = path => (extname(path).toLowerCase() === '.svg' ? 'image/svg+xml' : 'image/png')

/**
 * The associated-icon extraction script. `-File` with positional args keeps
 * paths out of the command line's parsing, so neither the executable nor the
 * output path reaches PowerShell's own quoting; `ExtractAssociatedIcon` yields
 * 32px, the most the stock .NET surface gives without a native addon.
 */
const EXTRACT_ICON_PS1 = [
  'param([string]$Source, [string]$Target)',
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Drawing',
  '$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Source)',
  'if ($null -eq $icon) { exit 1 }',
  '$bitmap = $icon.ToBitmap()',
  '$bitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)',
  '',
].join('\n')

/** The bytes of an output file a host command that exited 0 may still not have written. */
async function readIfWritten(path) {
  try {
    return await readFile(path)
  } catch {
    return null
  }
}

/** Info.plist may declare an icon file that is not on disk. */
async function existsOnDisk(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** The `.icns` name `CFBundleIconFile` declares; malformed plutil JSON leaves the Resources scan to decide. */
function declaredBundleIconFile(plistJson) {
  try {
    const declared = JSON.parse(plistJson).CFBundleIconFile
    if (typeof declared === 'string' && declared !== '') {
      return declared.endsWith('.icns') ? declared : `${declared}.icns`
    }
  } catch {
    return null
  }
  return null
}

/**
 * Extract one bundle's icon as a 128px PNG: read `CFBundleIconFile` from
 * Info.plist (`plutil` to JSON; the value may omit the `.icns` extension), fall
 * back to the first `Resources/*.icns`, then convert with `sips` through a fresh
 * temp directory.
 */
async function extractBundleIconPng(bundlePath, timeoutMs) {
  const resources = join(bundlePath, 'Contents', 'Resources')
  const plistJson = await runHostCommand(
    'plutil', ['-convert', 'json', '-o', '-', join(bundlePath, 'Contents', 'Info.plist')], timeoutMs)
  let iconFile = plistJson === null ? null : declaredBundleIconFile(plistJson)
  if (iconFile === null) {
    try {
      iconFile = (await readdir(resources)).find(entry => entry.endsWith('.icns')) ?? null
    } catch {
      return null
    }
  }
  if (iconFile === null) return null
  const icns = join(resources, iconFile)
  if (!await existsOnDisk(icns)) return null
  const workDir = await mkdtemp(join(tmpdir(), 'freddie-open-in-app-'))
  try {
    const outPng = join(workDir, 'icon.png')
    const converted = await runHostCommand(
      'sips', ['-s', 'format', 'png', '-Z', '128', icns, '--out', outPng], timeoutMs)
    if (converted === null) return null
    return await readIfWritten(outPng)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

/** Extract one Windows executable's associated icon as a 32px PNG. */
async function extractExecutableIconPng(executablePath, timeoutMs) {
  const workDir = await mkdtemp(join(tmpdir(), 'freddie-open-in-app-'))
  try {
    const script = join(workDir, 'extract-icon.ps1')
    const outPng = join(workDir, 'icon.png')
    await writeFile(script, EXTRACT_ICON_PS1, 'utf8')
    const ran = await runHostCommand('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, executablePath, outPng,
    ], timeoutMs)
    if (ran === null) return null
    return await readIfWritten(outPng)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

/**
 * Resolve one Linux `Icon=` value to icon bytes: an absolute path is read
 * directly, a theme name is looked up in the hicolor theme's largest size first
 * and then in `pixmaps`. Only the hicolor theme and pixmaps are consulted — the
 * user's active icon theme is not, because resolving it would mean reading its
 * `index.theme` inheritance chain and every inherited directory.
 */
async function desktopApplicationIcon(icon, dataDirectories) {
  if (icon.includes('/')) {
    try {
      return { bytes: await readFile(icon), contentType: contentTypeOf(icon) }
    } catch {
      return null
    }
  }
  for (const dataDir of dataDirectories) {
    for (const size of HICOLOR_DIRECTORIES) {
      for (const extension of ['.png', '.svg']) {
        const candidate = join(dataDir, 'icons', 'hicolor', size, 'apps', `${icon}${extension}`)
        try {
          return { bytes: await readFile(candidate), contentType: contentTypeOf(candidate) }
        } catch {
          continue
        }
      }
    }
  }
  for (const dataDir of dataDirectories) {
    for (const extension of ['.png', '.svg']) {
      const candidate = join(dataDir, 'pixmaps', `${icon}${extension}`)
      try {
        return { bytes: await readFile(candidate), contentType: contentTypeOf(candidate) }
      } catch {
        continue
      }
    }
  }
  return null
}

/** One Linux application's icon from its desktop entry's `Icon=` key. */
async function extractLinuxIcon(desktopId) {
  const entry = await findDesktopEntry(desktopId)
  const icon = entry?.icon
  if (icon === undefined || icon === '') return null
  return desktopApplicationIcon(icon, xdgDataDirectories())
}

/**
 * Extract one resolved application's icon on this host.
 * @param app - catalog entry (its Linux spec names the desktop entry).
 * @param resolved - the entry's verified launch (its icon source on macOS/Windows).
 * @param timeoutMs - per-command deadline for extraction host commands.
 * @returns the icon bytes and media type, or null when this host serves none.
 */
export async function extractAppIcon(app, resolved, timeoutMs) {
  if (osPlatform() === 'linux') {
    const desktopId = app.platforms.linux?.desktopId
    return desktopId === undefined ? null : extractLinuxIcon(desktopId)
  }
  if (resolved.icon === undefined) return null
  const bytes = resolved.icon.kind === 'app-bundle'
    ? await extractBundleIconPng(resolved.icon.path, timeoutMs)
    : await extractExecutableIconPng(resolved.icon.path, timeoutMs)
  return bytes === null ? null : { bytes, contentType: 'image/png' }
}
