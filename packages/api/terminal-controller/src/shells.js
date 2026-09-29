function profile(path) {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const kind = name.toLowerCase().replace(/\.exe$/u, '')
  return { path, name, args: kind === 'cmd' ? [] : kind === 'pwsh' || kind === 'powershell' ? ['-NoLogo'] : ['-i'] }
}

export async function resolveShell(subprocess, configured, signal) {
  const shell = configured ?? profile(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh')
  return { ...shell, path: await subprocess.resolveExecutable(shell.path, undefined, signal) }
}

export async function discoverShells(subprocess, configured, candidates, signal) {
  const preferred = await resolveShell(subprocess, configured, signal)
  const found = await Promise.all(candidates.map(async (candidate) => {
    try {
      return await resolveShell(subprocess, profile(candidate), signal)
    } catch (_resolutionUnavailable) {
      return undefined
    }
  }))
  const shells = new Map()
  for (const shell of [preferred, ...found]) {
    if (shell === undefined) continue
    const key = shell.path.includes('\\') ? shell.path.toLowerCase() : shell.path
    if (!shells.has(key)) shells.set(key, shell)
  }
  return [...shells.values()]
}
