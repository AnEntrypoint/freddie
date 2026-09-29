
const PACKAGE_NAME = '@freddie/freddie-compaction-image-offload'

export const name = 'compaction-image-offload-invariant'
export const inject = ['invariants']

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIndex(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
}

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

function validateSession(session, fail) {
  for (const [index, event] of session.events.entries()) {
    if (event.type === 'image/offload') validateOffload(session.events.slice(0, index), event, fail)
  }
}

const install = Object.assign((ctx, fail) => {
  for (const session of ctx.sessions.list()) validateSession(session, fail)
  ctx.on('session/created', (session) => { validateSession(session, fail) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args
    if (event.type === 'image/offload') validateOffload(session.events, event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = ctx => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
