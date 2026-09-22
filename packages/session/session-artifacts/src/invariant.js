export const name = 'session-artifacts-invariant'
export const inject = ['invariants', 'sessionArtifacts']

const install = ({ report }) => ({ session }) => {
  const artifacts = session.events.filter(event => event.type === 'session-artifacts/changed')
  for (const event of artifacts) {
    if (!Number.isSafeInteger(event.data.revision) || !Array.isArray(event.data.items)) {
      report('session-artifacts/changed must carry a complete revisioned artifact view')
    }
  }
}

export const apply = ctx => Promise.resolve(ctx.invariants.register('@freddie/freddie-session-artifacts', install))
