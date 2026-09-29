import { loadWin32DialogBindings } from './win32-dialog-bindings.js'
import { runFolderDialog } from './win32-dialog-logic.js'

const title = process.env.FREDDIE_DIALOG_TITLE ?? ''
if (title === '') throw new Error('win32-dialog-worker: FREDDIE_DIALOG_TITLE is required')
if (process.send === undefined) throw new Error('win32-dialog-worker must run as a child process with an IPC channel')
const send = process.send.bind(process)

const post = (message) => {
  /* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */
  send(message, () => { if (process.connected) process.disconnect() })
}

/* v8 ignore next 3 -- the handler exits(0), which would kill the unit lane; built-worker.e2e.ts owns the real disconnect lifecycle. */
process.on('disconnect', () => process.exit(0))

void (async () => {
  try {
    const bindings = await loadWin32DialogBindings()
    const path = runFolderDialog(bindings, title, (threadId) => {
      post({ kind: 'showing', threadId })
    })
    post({ kind: 'done', path })
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    post({ kind: 'error', message })
  }
})()
