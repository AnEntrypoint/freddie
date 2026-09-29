import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function spawnDialogWorker(data) {
  const env = { ...process.env, FREDDIE_DIALOG_TITLE: data.title }
  const stdio = ['ignore', 'inherit', 'inherit', 'ipc']
  return spawn(process.execPath, [fileURLToPath(new URL('./win32-dialog-worker.js', import.meta.url))], { env, stdio, windowsHide: true })
}

export { closeThreadWindows } from './win32-dialog-bindings.js'
