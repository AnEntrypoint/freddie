export const HRESULT_CANCELLED = 0x800704c7 | 0

export const FOS_PICKFOLDERS = 0x20
export const FOS_FORCEFILESYSTEM = 0x40
export const FOS_NOCHANGEDIR = 0x8

function check(hr, what) {
  if (hr < 0) throw new Error(`${what} failed: HRESULT 0x${(hr >>> 0).toString(16)}`)
  return hr
}

export function runFolderDialog(bindings, title, onShowing) {
  bindings.setThreadDpiAwareness()
  check(bindings.coInitializeSta(), 'CoInitializeEx')
  try {
    const dialog = bindings.createFolderDialog()
    try {
      check(dialog.setOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR), 'SetOptions')
      check(dialog.setTitle(title), 'SetTitle')
      onShowing(bindings.currentThreadId())
      const shown = dialog.show()
      if (shown === HRESULT_CANCELLED) return null
      check(shown, 'Show')
      const result = dialog.resultPath()
      check(result.hr, 'GetResult')
      return result.path
    } finally {
      dialog.release()
    }
  } finally {
    bindings.coUninitialize()
  }
}
