export class SchedulePersistenceError extends Error {
  constructor(cause) {
    super('Schedule persistence did not complete.', cause === undefined ? undefined : { cause })
    this.name = 'SchedulePersistenceError'
  }
}

export async function flushSchedulePersistence(ctx, session) {
  try {
    if (!await ctx.sessions.flush(session)) throw new SchedulePersistenceError()
  } catch (error) {
    if (error instanceof SchedulePersistenceError) throw error
    throw new SchedulePersistenceError(error)
  }
}
