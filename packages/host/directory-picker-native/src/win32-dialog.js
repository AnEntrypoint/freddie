import { closeThreadWindows as hostCloseThreadWindows, spawnDialogWorker } from './win32-dialog-host.js'

export const DIALOG_TITLE = 'Select Workspace Directory'

const CLOSE_RETRY_MS = 150
const CLOSE_MAX_ATTEMPTS = 20

/* v8 ignore start -- closed-union backstop; unreachable without a TypeScript contract violation */
function assertNever(value) {
  throw new TypeError(`unknown win32 dialog worker message kind: ${String(value)}`)
}
/* v8 ignore stop */

export async function pickWin32Directory(signal, internals = {}) {
  if (signal.aborted) throw new Error('native directory picker aborted')
  const spawnWorker = internals.spawnWorker ?? spawnDialogWorker
  const closeWindows = internals.closeThreadWindows ?? hostCloseThreadWindows
  const closeRetryMs = internals.closeRetryMs ?? CLOSE_RETRY_MS

  const worker = spawnWorker({ title: DIALOG_TITLE })
  let dialogThreadId
  let closeTimer
  let settled = false

  return await new Promise((resolve, reject) => {
    const settle = (outcome) => {
      if (settled) return
      settled = true
      if (closeTimer !== undefined) clearInterval(closeTimer)
      signal.removeEventListener('abort', onAbort)
      worker.unref?.()
      outcome()
    }

    const postClose = () => {
      if (dialogThreadId !== undefined) void closeWindows(dialogThreadId).catch(() => undefined)
    }

    const serviceAbort = () => {
      let attempts = 0
      closeTimer = setInterval(() => {
        attempts += 1
        if (attempts > CLOSE_MAX_ATTEMPTS) {
          settle(() => {
            worker.kill()
            reject(new Error('native directory picker aborted (dialog unresponsive; worker killed)'))
          })
          return
        }
        postClose()
      }, closeRetryMs)
      postClose()
    }

    const onAbort = () => {
      serviceAbort()
    }
    signal.addEventListener('abort', onAbort, { once: true })

    worker.on('message', (message) => {
      switch (message.kind) {
        case 'showing':
          dialogThreadId = message.threadId
          if (signal.aborted) postClose()
          return
        case 'done':
          settle(() => {
            if (signal.aborted) reject(new Error('native directory picker aborted'))
            else resolve(message.path)
          })
          return
        case 'error':
          settle(() => {
            reject(new Error(`win32 folder dialog failed: ${message.message}`))
          })
          return
        /* v8 ignore next 2 -- closed worker-owned union; a fourth kind becomes a compile error */
        default:
          assertNever(message)
      }
    })
    worker.on('error', (error) => {
      settle(() => {
        reject(error)
      })
    })
    worker.on('exit', () => {
      settle(() => {
        reject(new Error('win32 folder dialog worker exited before reporting a result'))
      })
    })
  })
}
