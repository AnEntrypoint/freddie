/** Package-owned invariant companion for `@freddie/freddie-compaction-image-offload`. @module @freddie/freddie-compaction-image-offload/invariant */

const PACKAGE_NAME = '@freddie/freddie-compaction-image-offload'

/** Cordis companion plugin name. */
export const name = 'compaction-image-offload-invariant'
/** Services required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Whether a durable value is a JSON object. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a durable occurrence index or sequence is canonical. */
function isIndex(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
}

/** Validate one offload selection against the log it names. */
function validateOffload(history, event, fail) {
  const data = event.data
  if (!isRecord(data) || !Array.isArray(data.targets) || data.targets.length === 0) {
    fail('image/offload: data must contain a nonempty targets array')
    return
  }
  const seen = new Set()
  for (const target of data.targets) {
    if (!isRecord(target) || !isIndex(target.seq)
      || !Array.isArray(target.imageIndexes) || target.imageIndexes.length === 0) {
      fail('image/offload: each target must contain a seq and nonempty imageIndexes')
      continue
    }
    if (seen.has(target.seq)) fail(`image/offload: duplicate target seq ${target.seq}`)
    seen.add(target.seq)
    const source = history[target.seq]
    if (source?.type !== 'user/message' && source?.type !== 'tool/result') {
      fail(`image/offload: target seq ${target.seq} must be user/message or tool/result`)
    }
    let previous = -1
    for (const index of target.imageIndexes) {
      if (!isIndex(index) || index <= previous) {
        fail('image/offload: imageIndexes must be strictly increasing non-negative safe integers')
        break
      }
      previous = index
    }
  }
}

/** Validate every offload selection already present in one loaded session. */
function validateSession(session, fail) {
  for (const [index, event] of session.events.entries()) {
    if (event.type === 'image/offload') validateOffload(session.events.slice(0, index), event, fail)
  }
}

/** Install validation for loaded and newly appended offload selections. */
const install = Object.assign((ctx, fail) => {
  for (const session of ctx.sessions.list()) validateSession(session, fail)
  ctx.on('session/created', (session) => { validateSession(session, fail) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args
    if (event.type === 'image/offload') validateOffload(session.events, event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = ctx => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
