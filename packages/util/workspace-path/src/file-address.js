
const FILE_ADDRESS_PREFIX = 'freddie-resource://file/'

function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

function encodePath(path) {
  return path.split('/').map(encodeSegment).join('/')
}

function isDriveSegment(segment) {
  return segment !== undefined && /^[A-Za-z]:$/.test(segment)
}

export function sessionFileAddress(sessionId, path) {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`
}

export function absoluteFileAddress(path) {
  const normalized = path.replace(/\\/g, '/')
  const unc = normalized.startsWith('//')
  const absolute = normalized.replace(/^\/+/, '')
  return `${FILE_ADDRESS_PREFIX}absolute/${unc ? '/' : ''}${encodePath(absolute)}`
}

export function parseFileAddress(address) {
  try {
    if (!address.startsWith(FILE_ADDRESS_PREFIX)) return undefined
    const end = address.search(/[?#]/)
    const [scope, ...rest] = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end).split('/')
    if (scope === 'session') {
      const [id, ...segments] = rest
      if (id === undefined || id === '' || segments.length === 0) return undefined
      return { scope, sessionId: decodeURIComponent(id), path: segments.map(decodeURIComponent).join('/') }
    }
    if (scope === 'absolute') {
      const unc = rest[0] === '' && rest.length > 1
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent)
      if (segments.length === 0 || segments[0] === '') return undefined
      if (unc) return { scope, path: `//${segments.join('/')}` }
      return { scope, path: isDriveSegment(segments[0]) ? segments.join('/') : `/${segments.join('/')}` }
    }
    return undefined
  } catch {
    return undefined
  }
}
