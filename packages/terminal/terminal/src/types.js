export class TerminalBackendCleanupError extends AggregateError {
  constructor(spawnError, cleanupError) {
    super([spawnError, cleanupError], 'PTY backend startup and cleanup both failed')
    this.spawnError = spawnError
    this.cleanupError = cleanupError
    this.name = 'TerminalBackendCleanupError'
  }
}
