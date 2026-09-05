/**
 * downloads domain query parsing. The download surface has no wire
 * envelope: the request arrives as query parameters (all strings), so
 * parseSessionLogQuery normalizes the raw query-parameter object into the
 * method's exact request shape. No validation is performed here — malformed
 * input (missing sessionId, garbage includeDescendants value) is passed
 * through as-is and fails downstream rather than being rejected at this
 * boundary.
 */

/**
 * session.export query params → the sessionLog request. `includeDescendants`
 * is treated as true only when it is exactly the string `'true'`; any other
 * value (including absent) is treated as false/omitted.
 */
export function parseSessionLogQuery(query) {
  return {
    sessionId: query.sessionId,
    ...(query.includeDescendants === 'true' ? { includeDescendants: true } : {}),
  }
}
