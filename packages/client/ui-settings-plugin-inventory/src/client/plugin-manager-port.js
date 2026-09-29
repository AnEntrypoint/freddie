const FORBIDDEN_MESSAGE = /\bHTTP 403\b/

function isForbidden(error) {
  return error.code === 'internal' && FORBIDDEN_MESSAGE.test(error.message)
}

function outcomeOf(result) {
  if (!result.ok) return isForbidden(result.error) ? { kind: 'forbidden' } : { kind: 'failed' }
  const answer = result.value
  if (answer.ok) return { kind: 'ok', value: answer.value }
  return { kind: 'refused', code: answer.error.code, ...answer.error.lock === undefined ? {} : { lock: answer.error.lock } }
}

async function outcomeOfCall(call) {
  try {
    return outcomeOf(await call())
  } catch {
    return { kind: 'failed' }
  }
}

export function createPluginManagerPort(remote) {
  return {
    describe: () => outcomeOfCall(() => remote.pluginManager.describe()),
    setDisabled: request => outcomeOfCall(() => remote.pluginManager.setDisabled(request)),
  }
}
