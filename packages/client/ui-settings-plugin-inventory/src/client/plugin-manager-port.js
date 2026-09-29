/**
 * The tab's view of the Host `pluginManager` namespace: every call answers one
 * of a few outcomes and never throws, so the component renders states instead
 * of transport details.
 *
 * - `ok` carries the answer's value.
 * - `forbidden` is the connection's 403 pin: the Host allows plugin switching from its own machine only.
 * - `refused` is the Host's typed answer, with its `code` and, for a locked entry, its `lock`.
 * - `failed` is anything else: a carrier failure, a withdrawn namespace, a codec mismatch.
 */

const FORBIDDEN_MESSAGE = /\bHTTP 403\b/

/** Whether a Remote failure is the connection's loopback pin. */
function isForbidden(error) {
  return error.code === 'internal' && FORBIDDEN_MESSAGE.test(error.message)
}

/** Fold a Remote result, including the namespace's own ok/error envelope, into one outcome. */
function outcomeOf(result) {
  if (!result.ok) return isForbidden(result.error) ? { kind: 'forbidden' } : { kind: 'failed' }
  const answer = result.value
  if (answer.ok) return { kind: 'ok', value: answer.value }
  return { kind: 'refused', code: answer.error.code, ...answer.error.lock === undefined ? {} : { lock: answer.error.lock } }
}

/** Never-throwing outcome of one Remote call. */
async function outcomeOfCall(call) {
  try {
    return outcomeOf(await call())
  } catch {
    return { kind: 'failed' }
  }
}

/**
 * @param remote - the Client `remote` service carrying the `pluginManager` namespace.
 * @returns the two calls the tab makes.
 */
export function createPluginManagerPort(remote) {
  return {
    describe: () => outcomeOfCall(() => remote.pluginManager.describe()),
    setDisabled: request => outcomeOfCall(() => remote.pluginManager.setDisabled(request)),
  }
}
