export const PROCESS_SHUTDOWN_TIMEOUT_MS = 5_000

export function createProcessShutdown(
  dispose,
  forceExit = (code) => { process.exit(code) },
  complete = (code) => { process.exitCode = code },
  timeoutMs = PROCESS_SHUTDOWN_TIMEOUT_MS,
) {
  let pending
  let timeout
  let completed = false
  let forceExited = false

  const clearExitTimeout = () => {
    if (timeout !== undefined) clearTimeout(timeout)
  }

  const forceExitOnce = (code) => {
    if (forceExited) return
    forceExited = true
    clearExitTimeout()
    forceExit(code)
  }

  const completeOnce = (code) => {
    if (completed || forceExited) return
    completed = true
    clearExitTimeout()
    complete(code)
  }

  const start = (code, forceAfterDispose) => {
    if (pending !== undefined) return pending
    timeout = setTimeout(() => { forceExitOnce(code) }, timeoutMs)
    pending = Promise.resolve().then(dispose).then(
      () => {
        if (forceAfterDispose) forceExitOnce(code)
        else completeOnce(code)
      },
      () => { forceExitOnce(code) },
    )
    return pending
  }

  return {
    shutdown(code) {
      return start(code, false)
    },
    interrupt(code) {
      if (pending !== undefined) {
        forceExitOnce(code)
        return
      }
      void start(code, true)
    },
  }
}
