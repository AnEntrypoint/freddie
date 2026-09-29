const KEY = 'freddie.terminal.shell'

export function preferredShell() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  } catch (_storageUnavailable) {
    return null
  }
}

export function rememberShell(path) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, path)
  } catch (_privateBrowsingOrQuotaFailureLeavesThisLaunchUsable) {
  }
}
