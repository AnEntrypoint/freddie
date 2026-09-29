import { timeoutOf } from '@freddie/freddie-timeout'

export function abortError(signal) {
  const timeout = timeoutOf(signal)
  if (timeout !== undefined) return timeout
  const reason = signal.reason
  if (reason instanceof Error) return reason
  return new Error('LSP query aborted')
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal)
}

export function abortable(work, signal) {
  if (signal === undefined) return work
  if (signal.aborted) return Promise.reject(abortError(signal))
  const canceled = Promise.withResolvers()
  const onAbort = () => { canceled.reject(abortError(signal)) }
  signal.addEventListener('abort', onAbort, { once: true })
  const normalized = work.catch((error) => {
    /* v8 ignore next */
    throw error instanceof Error ? error : new Error(String(error))
  })
  return Promise.race([normalized, canceled.promise])
    .finally(() => { signal.removeEventListener('abort', onAbort) })
}
