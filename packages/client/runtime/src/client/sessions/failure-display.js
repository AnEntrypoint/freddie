/**
 * Convert a durable failure into copy that is safe to expose in the GUI.
 * @param failure - Failure value preserved by the session event.
 * @returns Display-safe copy for client projections.
 */
export function displayFailureMessage(failure) {
  if (failure === null || typeof failure !== 'object') return String(failure)
  const record = failure
  if (record.code === 'AUTH') return 'API key is invalid'
  return typeof record.message === 'string' ? record.message : JSON.stringify(failure)
}
