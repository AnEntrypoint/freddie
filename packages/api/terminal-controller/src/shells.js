function profile(path) {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return { path, name, args: name.toLowerCase() === 'pwsh' ? ['-NoLogo'] : ['-i'] }
}

export async function resolveShell(subprocess, configured, signal) {
  const shell = configured ?? profile('/bin/sh')
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
    if (!shells.has(shell.path)) shells.set(shell.path, shell)
  }
  return [...shells.values()]
}
