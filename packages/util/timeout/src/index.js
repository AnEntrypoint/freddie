export class TimeoutReason extends Error {
  name = 'TimeoutReason'

  constructor(code, timeoutMs) {
    super(`${code} after ${timeoutMs}ms`)
    this.code = code
    this.timeoutMs = timeoutMs
  }
}

export const MAX_TIMER_DELAY_MS = 2_147_483_647

function assertTimerDelay(timeoutMs, name) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`${name} must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

export function clampTimeout(
  requested,
  def,
  max,
  name = 'timeoutMs',
) {
  if (requested !== undefined && (!Number.isFinite(requested) || requested <= 0)) {
    throw new Error(`${name} must be a positive finite number`)
  }
  return Math.min(requested ?? def, max)
}

/**
 * A deadline signal plus the cleanup that clears its timer (dispose-once).
 * @typedef {Disposable & { signal: AbortSignal }} Deadline
 */

/**
 * Rearmable timeout around one outstanding async-iterator demand.
 * @typedef {Disposable & {
 *   signal: AbortSignal,
 *   next: function(AsyncIterator<unknown>): Promise<IteratorResult<unknown>>,
 *   pulse: function(): void
 * }} IdleWatchdog
 */

export function deadline(
  upstream,
  timeoutMs,
  code,
) {
  if (timeoutMs <= 0) {
    return { signal: upstream ?? new AbortController().signal, [Symbol.dispose]() {} }
  }

  assertTimerDelay(timeoutMs, 'deadline timeoutMs')

  const timer = new AbortController()
  const id = setTimeout(() => { timer.abort(new TimeoutReason(code, timeoutMs)) }, timeoutMs)
  return {
    signal: upstream !== undefined ? AbortSignal.any([upstream, timer.signal]) : timer.signal,
    [Symbol.dispose]() { clearTimeout(id) },
  }
}

export function idleWatchdog(
  upstream,
  timeoutMs,
  code,
) {
  assertTimerDelay(timeoutMs, 'idleWatchdog timeoutMs')
  const timeout = new AbortController()
  const signal = upstream === undefined
    ? timeout.signal
    : AbortSignal.any([upstream, timeout.signal])
  let timer
  let outstanding = false
  let disposed = false

  const arm = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timeout.abort(new TimeoutReason(code, timeoutMs))
    }, timeoutMs)
  }

  return {
    signal,
    async next(iterator) {
      if (disposed) throw new Error('idleWatchdog is disposed')
      if (outstanding) throw new Error('idleWatchdog next is already outstanding')
      outstanding = true
      arm()
      try {
        return await iterator.next()
      } finally {
        clearTimeout(timer)
        timer = undefined
        outstanding = false
      }
    },
    pulse() {
      if (disposed || !outstanding) return
      arm()
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    },
  }
}

export function timeoutOf(x, code) {
  const reason = x.reason
  if (!(reason instanceof TimeoutReason)) return undefined
  return code === undefined || reason.code === code ? reason : undefined
}
