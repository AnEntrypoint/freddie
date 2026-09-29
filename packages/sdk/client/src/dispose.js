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
