import { isLoopbackHostname } from './loopback-hostname.js'

function header(headers, name) {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

function isBareAuthority(url) {
  return url.username === '' && url.password === ''
    && url.pathname === '/' && url.search === '' && url.hash === ''
}

export function assertTrustedAuthority(entry) {
  const entryUrl = parseAuthority(entry)
  if (entryUrl !== undefined && canonicalAuthority(entry, entryUrl) === entry.toLowerCase()) return
  throw new Error(`client-connection: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`)
}

function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

function requestAuthority(request) {
  const host = header(request.headers, 'host')
  if (host === undefined) return undefined
  const hostUrl = parseAuthority(host)
  return hostUrl !== undefined && isBareAuthority(hostUrl) ? hostUrl : undefined
}

function isOurAuthority(hostUrl, trustedHosts) {
  return isLoopbackHostname(hostUrl.hostname) || isTrustedAuthority(hostUrl, trustedHosts)
}

function isMarkedCrossSite(request) {
  return header(request.headers, 'sec-fetch-site') === 'cross-site'
}

function originMatchesAuthority(request, hostUrl) {
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

export function isTrustedApiRequest(request, trustedHosts) {
  const hostUrl = requestAuthority(request)
  if (hostUrl === undefined) return false
  if (!isOurAuthority(hostUrl, trustedHosts)) return false
  if (isMarkedCrossSite(request)) return false
  return originMatchesAuthority(request, hostUrl)
}
