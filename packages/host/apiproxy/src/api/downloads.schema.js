export function parseSessionLogQuery(query) {
  return {
    sessionId: query.sessionId,
    ...(query.includeDescendants === 'true' ? { includeDescendants: true } : {}),
  }
}
