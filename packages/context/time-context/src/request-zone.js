
import { assertNever } from '@freddie/freddie-llm'

const IANA_TIME_ZONE = /^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)+$/

function browserTimeZone(message) {
  const source = message.source
  const value = source.kind === 'user'
    && 'rpcId' in source
    && typeof source.rpcId === 'string'
    && 'clientTimeZone' in source
    && typeof source.clientTimeZone === 'string'
    ? source.clientTimeZone
    : undefined
  if (value === undefined) return undefined
  if (value !== 'UTC' && !IANA_TIME_ZONE.test(value)) {
    throw new TypeError(
      `browser time zone must be canonical UTC or IANA Area/Location: ${JSON.stringify(value)}`,
    )
  }
  let canonical
  try {
    canonical = new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch (error) {
    throw new TypeError(`browser time zone is unsupported: ${JSON.stringify(value)}`, { cause: error })
  }
  if (canonical !== value) {
    throw new TypeError(`browser time zone must be canonical: ${JSON.stringify(value)}`)
  }
  return value
}

export function deriveBrowserTimeZoneContext(messages) {
  const timeZones = [...new Set(messages.flatMap((message) => {
    const timeZone = browserTimeZone(message)
    return timeZone === undefined ? [] : [timeZone]
  }))].sort()
  const [timeZone, ...remaining] = timeZones
  if (timeZone === undefined) return { kind: 'missing' }
  if (remaining.length === 0) return { kind: 'resolved', timeZone }
  return { kind: 'mixed', timeZones }
}

export function renderBrowserTimeZoneContext(context) {
  switch (context.kind) {
    case 'resolved':
      return `Browser time zone for this request: ${context.timeZone}. `
        + 'Interpret otherwise-unqualified dates and times in this zone.'
    case 'mixed':
      return `Browser time zone for this request: mixed ${JSON.stringify(context.timeZones)}. `
        + 'Ask the user to clarify otherwise-unqualified dates and times.'
    case 'missing':
      return 'Browser time zone for this request: unavailable. '
        + 'Ask the user to clarify otherwise-unqualified dates and times.'
    default:
      return assertNever(context, 'BrowserTimeZoneContext')
  }
}
