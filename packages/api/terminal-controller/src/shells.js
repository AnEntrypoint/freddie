/** Shell selection and executable verification against the subprocess provider. */

/**
 * Derive a display profile and interaction arguments from one executable path.
 * @param {string} path - executable path or PATH name.
 * @returns {import('./types.js').TerminalShell} unverified shell profile.
 */
function profile(path) {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const kind = name.toLowerCase().replace(/\.exe$/u, '')
  return { path, name, args: kind === 'cmd' ? [] : kind === 'pwsh' || kind === 'powershell' ? ['-NoLogo'] : ['-i'] }
}

/**
 * Resolve the configured shell, or this Host platform's fallback shell.
 * @param {import('@freddie/freddie-subprocess').SubprocessRuntime} subprocess - target execution provider.
 * @param {import('./types.js').TerminalShell | undefined} configured - optional profile overriding the fallback.
 * @param {AbortSignal} signal - resolution cancellation.
 * @returns {Promise<import('./types.js').TerminalShell>} one verified shell.
 */
export async function resolveShell(subprocess, configured, signal) {
  const shell = configured ?? profile(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh')
  return { ...shell, path: await subprocess.resolveExecutable(shell.path, undefined, signal) }
}

/**
 * List verified candidates after the configured or fallback shell.
 * A candidate that fails to resolve is omitted rather than failing the menu:
 * the provider reports a lookup miss as a plain Error with no typed class, so
 * an unavailable shell and a transport failure are indistinguishable here.
 * @param {import('@freddie/freddie-subprocess').SubprocessRuntime} subprocess - target execution provider.
 * @param {import('./types.js').TerminalShell | undefined} configured - optional default profile.
 * @param {readonly string[]} candidates - executable names or paths permitted for shell selection.
 * @param {AbortSignal} signal - discovery cancellation.
 * @returns {Promise<import('./types.js').TerminalShell[]>} unique shells, with the default first.
 */
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
