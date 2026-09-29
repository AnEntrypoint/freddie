/**
 * Private teardown ladder for the runtime subprocess: stdin EOF (cooperative
 * quiesce), then SIGTERM, then SIGKILL, resolving only after the process has
 * actually exited. The SDK client runs OUTSIDE any harness context, so it
 * cannot ride the `freddie-subprocess` service — this module is the seam's
 * documented exception for SDK-managed transports.
 *
 * @module @freddie/freddie-sdk-client/dispose
 */

/**
 * Race the child's exit against a timer. Neither outcome leaves anything
 * behind on the child: the exit listener is removed on timeout and the timer
 * is cleared on exit, so the ladder's tiers never accumulate listeners.
 */
function exitsWithin(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, ms).unref()
    child.once('exit', onExit)
  })
}

/** Force-terminate the runtime and reject if no exit edge arrives within the grace. */
function forceTerminateWithin(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let accepted = false
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      child.off('exit', onExit)
      child.off('error', onError)
    }
    const settle = (complete) => {
      if (settled) return
      settled = true
      cleanup()
      complete()
    }
    const onExit = () => { settle(resolve) }
    const onError = (error) => { settle(() => { reject(error) }) }
    child.once('exit', onExit)
    child.once('error', onError)
    const timer = setTimeout(() => {
      const disposition = accepted ? 'accepted' : 'refused'
      settle(() => {
        reject(new Error(`runtime process did not exit within ${ms}ms after SIGKILL was ${disposition}`))
      })
    }, ms).unref()
    try {
      accepted = child.kill('SIGKILL')
      if (child.exitCode !== null || child.signalCode !== null) settle(resolve)
    } catch (error) {
      settle(() => { reject(new Error('SIGKILL failed', { cause: error })) })
    }
  })
}

/**
 * Tear the runtime down to quiescence, resolving only after exit: close stdin
 * and allow cooperative flush, then use the host's graceful and forced
 * termination semantics. POSIX sends `SIGTERM` before `SIGKILL`; Windows
 * skips directly to forced termination because Node maps both signals to
 * `TerminateProcess`.
 * @param child - the runtime child process to tear down.
 * @param graces - the EOF and termination-confirmation windows (ms).
 * @param platform - the host platform, injectable for unit coverage.
 * @throws When forced termination errors or the child does not report exit
 * within `disposeGraceMs`.
 */
export async function disposeRuntimeProcess(
  child,
  graces,
  platform = process.platform,
) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.stdin?.end()
  if (await exitsWithin(child, graces.disposeEofGraceMs)) return
  if (platform !== 'win32') {
    child.kill('SIGTERM')
    if (await exitsWithin(child, graces.disposeGraceMs)) return
  }
  await forceTerminateWithin(child, graces.disposeGraceMs)
}
