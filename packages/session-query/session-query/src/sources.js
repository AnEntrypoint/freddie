import { SessionQueryError } from './config.js'

export function assertSessionHeadersCompatible(a, b) {
  if (
    a.version !== b.version
    || a.id !== b.id
    || a.createdAt !== b.createdAt
    || a.cwd !== b.cwd
    || a.parentSession !== b.parentSession
    || a.seedLength !== b.seedLength
    || (a.delegationDepth ?? 0) !== (b.delegationDepth ?? 0)
  ) {
    throw new SessionQueryError(
      `session source headers conflict for session "${a.id}"`,
      'SESSION_QUERY_SOURCE_CONFLICT',
    )
  }
}
