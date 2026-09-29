/* jscpd:ignore-start -- deliberate twin of freddie-tool-bash/background.ts (Agent Note). */

export function processOutcome(proc) {
  if (proc.status === 'killed') {
    return { status: 'killed', detail: proc.signal !== null ? `signal: ${proc.signal}` : 'killed before exit' }
  }
  return { status: 'completed', detail: `exit code: ${proc.exitCode ?? 0}` }
}
/* jscpd:ignore-end */
