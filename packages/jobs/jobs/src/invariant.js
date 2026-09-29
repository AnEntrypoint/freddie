const PACKAGE_NAME = '@freddie/freddie-jobs'
const TERMINAL_STATUSES = new Set(['completed', 'killed', 'failed'])

export const name = 'jobs-invariant'
export const inject = ['invariants']

function validateSnapshot(snapshot, owner, fail) {
  const id = String(snapshot.id)
  const prefix = `${snapshot.kind}-`
  const ordinal = Number(id.slice(prefix.length))
  if (snapshot.kind.length === 0 || !id.startsWith(prefix)
    || !Number.isSafeInteger(ordinal) || ordinal < 1) {
    fail(`job snapshot id ${JSON.stringify(id)} must be ${JSON.stringify(prefix)} followed by a positive ordinal`)
  }
  if (snapshot.label.length === 0) fail(`job ${JSON.stringify(id)} label must be non-empty`)
  if (!Number.isSafeInteger(snapshot.startedAt) || snapshot.startedAt < 0) {
    fail(`job ${JSON.stringify(id)} startedAt must be a non-negative epoch integer`)
  }

  const terminal = TERMINAL_STATUSES.has(snapshot.status)
  if (terminal !== (snapshot.finishedAt !== undefined)) {
    fail(`job ${JSON.stringify(id)} finishedAt must be present exactly for a terminal status`)
  }
  if (snapshot.finishedAt !== undefined
    && (!Number.isSafeInteger(snapshot.finishedAt) || snapshot.finishedAt < snapshot.startedAt)) {
    fail(`job ${JSON.stringify(id)} finishedAt must be an epoch integer no earlier than startedAt`)
  }

  const expectedOwner = owner?.id
  if (snapshot.ownerSession !== expectedOwner) {
    fail(`job ${JSON.stringify(id)} ownerSession does not match its completion owner`)
  }
}

const install = Object.assign((ctx, fail) => {
  for (const snapshot of ctx.jobs.list()) validateSnapshot(snapshot, undefined, fail)
  ctx.jobs.onJobDone((snapshot, owner) => { validateSnapshot(snapshot, owner, fail) })
}, { inject: ['jobs'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
