function isMatchAll(matcher) {
  return matcher === undefined || matcher === '' || matcher === '*'
}

const CLAUDE_LITERAL = /^[A-Za-z0-9_|]+$/

function compileRegex(pattern) {
  try {
    return new RegExp(pattern)
  } catch (_syntaxError) {
    return undefined
  }
}

export function matcherDiagnostic(matcher, mode) {
  if (isMatchAll(matcher)) return undefined
  const pattern = matcher
  if (mode === 'claude-code' && CLAUDE_LITERAL.test(pattern)) return undefined
  return compileRegex(pattern) === undefined
    ? `invalid ${mode} regex matcher ${JSON.stringify(pattern)}`
    : undefined
}

export function matchesMatcher(matcher, query, mode) {
  if (isMatchAll(matcher)) return true
  const pattern = matcher
  if (mode === 'claude-code' && CLAUDE_LITERAL.test(pattern)) {
    return pattern.split('|').includes(query)
  }
  return compileRegex(pattern)?.test(query) ?? false
}
