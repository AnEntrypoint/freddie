export const DEFAULT_STDERR_SUMMARY_MAX_CHARS = 500

export function summarizeStderr(stderr, maxChars) {
  const t = stderr.trim()
  if (t.length === 0) return undefined
  return t.length > maxChars ? t.slice(0, maxChars) + '…' : t
}

export function appendHookInvoked(session, invocation) {
  session.append('hook/invoked', {
    turn: invocation.turn,
    point: invocation.point,
    dialect: invocation.dialect,
    handlerId: invocation.handlerId,
    ...invocation.matcher !== undefined ? { matcher: invocation.matcher } : {},
  })
}

export function appendHookResult(session, record) {
  const { output } = record
  const stderrSummary = summarizeStderr(output.stderr, record.stderrSummaryMaxChars)
  session.append('hook/result', {
    turn: record.turn,
    point: record.point,
    handlerId: record.handlerId,
    decision: output.decision ?? (output.continue === false ? 'stop' : 'pass'),
    ...output.exitCode !== undefined ? { exitCode: output.exitCode } : {},
    ...stderrSummary !== undefined ? { stderrSummary } : {},
    durationMs: record.durationMs,
  })
}
