import { foldTeam } from './fold.js'

export class TeamJournal {
  tails = new Map()

  constructor(ctx, onCommit) {
    this.ctx = ctx
    this.onCommit = onCommit
  }

  state(root) {
    return foldTeam(root.id, root.session.events)
  }

  async transact(rootId, operation) {
    const prior = this.tails.get(rootId) ?? Promise.resolve()
    const run = prior.then(operation, operation)
    const tail = run.then(() => undefined, () => undefined)
    this.tails.set(rootId, tail)
    try {
      return await run
    } finally {
      if (this.tails.get(rootId) === tail) this.tails.delete(rootId)
    }
  }

  async appendAndFlush(root, type, data) {
    const append = root.session.append.bind(root.session)
    append(type, data)
    await this.ctx.sessions.flush(root.session)
    this.onCommit(root)
  }
}
