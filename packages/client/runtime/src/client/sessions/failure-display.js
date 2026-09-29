export function displayFailureMessage(failure) {
  if (failure === null || typeof failure !== 'object') return String(failure)
  const record = failure
  if (record.code === 'AUTH') return 'API key is invalid'
  return typeof record.message === 'string' ? record.message : JSON.stringify(failure)
}
