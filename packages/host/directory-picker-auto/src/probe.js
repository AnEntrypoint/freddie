import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

const LINUX_CHOOSER_BINARIES = ['zenity', 'kdialog']

export function canExecute(candidate) {
  try {
    accessSync(candidate, constants.X_OK)
  } catch {
    return false
  }
  return true
}

export function hasLinuxChooserBinary(pathValue, isExecutable) {
  for (const dir of (pathValue ?? '').split(delimiter)) {
    if (dir === '') continue
    for (const name of LINUX_CHOOSER_BINARIES) {
      if (isExecutable(join(dir, name))) return true
    }
  }
  return false
}
