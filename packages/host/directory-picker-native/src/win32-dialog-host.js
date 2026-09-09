/**
 * Real-process half of the Win32 dialog driver: spawn the dialog child
 * process and close a dialog thread's windows. The module itself loads
 * everywhere (the import chain from native-picker.js is static); what stays
 * win32-only is koffi, imported dynamically inside the bindings' functions.
 * The driver's logic is tested against fakes of this surface instead.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Spawn the dialog child process: plain node against the buildless worker
 * source, no build step. The dialog is the child's first window, so Windows
 * activates it without a foreground call.
 * @param data - the child payload (dialog title).
 * @returns the spawned child process.
 */
export function spawnDialogWorker(data) {
  const env = { ...process.env, FREDDIE_DIALOG_TITLE: data.title }
  const stdio = ['ignore', 'inherit', 'inherit', 'ipc']
  return spawn(process.execPath, [fileURLToPath(new URL('./win32-dialog-worker.js', import.meta.url))], { env, stdio, windowsHide: true })
}

export { closeThreadWindows } from './win32-dialog-bindings.js'
