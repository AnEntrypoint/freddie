
export function resolvedClientTimeZone() {
  const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
  if (typeof timeZone !== 'string' || timeZone.length === 0) {
    throw new Error('browser time zone is unavailable')
  }
  return timeZone
}
