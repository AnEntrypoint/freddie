import { CommandExitError, e2bControlEnvs, SandboxNotFoundError } from '@freddie/freddie-e2b'

export function asError(error) {
  return error instanceof Error ? error : new Error(String(error))
}

export function signalOpts(signal) {
  return signal === undefined ? {} : { signal }
}

export function commandOpts(envs, signal) {
  return { envs: e2bControlEnvs(envs), ...signalOpts(signal) }
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function waitTick(pollMs, signal) {
  if (signal?.aborted === true) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(true)
    }, pollMs)
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function signalRemoteGroups(sandbox, envs, groups, signal) {
  try {
    await sandbox.commands.run(
      `kill -${signal} -- ${groups.map(group => `-${group}`).join(' ')}`,
      commandOpts(envs),
    )
  } catch (error) {
    if (!(error instanceof CommandExitError) && !(error instanceof SandboxNotFoundError)) throw error
  }
}
