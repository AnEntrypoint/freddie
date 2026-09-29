import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { platform as osPlatform, tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { findDesktopEntry, runHostCommand, xdgDataDirectories } from './resolver.js'


const HICOLOR_DIRECTORIES = [
  '256x256', '128x128', '96x96', '72x72', '64x64', '48x48', '32x32', '24x24', '22x22', '16x16',
  'scalable',
]

const contentTypeOf = path => (extname(path).toLowerCase() === '.svg' ? 'image/svg+xml' : 'image/png')

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

async function readIfWritten(path) {
  try {
    return await readFile(path)
  } catch {
    return null
  }
}

async function existsOnDisk(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

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

async function extractLinuxIcon(desktopId) {
  const entry = await findDesktopEntry(desktopId)
  const icon = entry?.icon
  if (icon === undefined || icon === '') return null
  return desktopApplicationIcon(icon, xdgDataDirectories())
}

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
