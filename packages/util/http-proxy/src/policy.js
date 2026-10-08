
export const LOOPBACK_NO_PROXY = ['localhost', '127.0.0.1', '::1', '[::1]']

export const POLICY_ENV_NAMES = {
  httpProxy: ['http_proxy', 'HTTP_PROXY'],
  httpsProxy: ['https_proxy', 'HTTPS_PROXY'],
  noProxy: ['no_proxy', 'NO_PROXY'],
}

export const PROXY_ENV_NAMES = [
  ...Object.values(POLICY_ENV_NAMES).flat(),
  'all_proxy',
  'ALL_PROXY',
]

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:'])

const SOCKS_PROTOCOLS = new Set(['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'])

export const DIRECT_POLICY = { noProxy: '', source: 'none' }

const ABSENT = { kind: 'absent' }

function readEnv(env, lower) {
  for (const name of [lower, lower.toUpperCase()]) {
    const value = env.get(name)?.value.trim()
    if (value !== undefined && value !== '') return { value, name }
  }
  return undefined
}

function acceptProxyUrl(candidate, diagnostics) {
  if (candidate === undefined) return ABSENT
  const parsed = URL.parse(candidate.value)
  if (parsed === null) {
    diagnostics.push({
      kind: 'invalid',
      origin: candidate.name,
      message: `${candidate.name} is not a valid URL; connecting directly`,
    })
    return { kind: 'rejected' }
  }
  if (SOCKS_PROTOCOLS.has(parsed.protocol)) {
    diagnostics.push({
      kind: 'socks',
      origin: candidate.name,
      message: `${candidate.name} names a SOCKS proxy, which is not supported; connecting directly for that scheme — set an http:// or https:// proxy URL instead`,
    })
    return { kind: 'rejected' }
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    diagnostics.push({
      kind: 'invalid',
      origin: candidate.name,
      message: `${candidate.name} uses the unsupported ${parsed.protocol}// scheme; connecting directly for that scheme — set an http:// or https:// proxy URL instead`,
    })
    return { kind: 'rejected' }
  }
  return { kind: 'accepted', value: candidate.value }
}

export function isSupportedProxyUrl(value) {
  const parsed = URL.parse(value)
  return parsed !== null && SUPPORTED_PROTOCOLS.has(parsed.protocol)
}

function resolveScheme(own, ...fallbacks) {
  if (own.kind === 'accepted') return own.value
  if (own.kind === 'rejected') return undefined
  return fallbacks.find(value => value !== undefined)
}

function withLoopback(noProxy) {
  const entries = (noProxy ?? '').split(/[,\s]+/).map(entry => entry.trim()).filter(entry => entry !== '')
  if (entries.includes('*')) return '*'
  const present = new Set(entries.map(entry => entry.toLowerCase()))
  return [...entries, ...LOOPBACK_NO_PROXY.filter(entry => !present.has(entry))].join(',')
}

function splitHostPort(entry) {
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']')
    if (close !== -1) {
      const rest = entry.slice(close + 1)
      const host = entry.slice(1, close)
      return rest.startsWith(':') ? { host, port: rest.slice(1) } : { host }
    }
  }
  const colon = entry.indexOf(':')
  if (colon !== -1 && entry.indexOf(':', colon + 1) === -1) {
    return { host: entry.slice(0, colon), port: entry.slice(colon + 1) }
  }
  return { host: entry }
}

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'

const LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)

export function isLoopbackHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true
  const mappedHigh = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host)?.[1]
  if (mappedHigh !== undefined) return Number.parseInt(mappedHigh, 16) >>> 8 === 127
  return LOOPBACK_IPV4.test(host.startsWith('::ffff:') ? host.slice('::ffff:'.length) : host)
}

export function bypassesProxy(noProxy, url) {
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  const port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80'
  for (const raw of noProxy.split(/[,\s]+/)) {
    const entry = raw.trim().toLowerCase()
    if (entry === '') continue
    if (entry === '*') return true
    const split = splitHostPort(entry)
    if (split.port !== undefined && split.port !== port) continue
    const candidate = split.host.replace(/^\*?\./, '').replace(/\.$/, '')
    if (candidate === '') continue
    if (host === candidate || host.endsWith(`.${candidate}`)) return true
  }
  return false
}

export function resolveProxyPolicy(env) {
  const diagnostics = []
  const all = acceptProxyUrl(readEnv(env, 'all_proxy'), diagnostics)
  const allValue = all.kind === 'accepted' ? all.value : undefined
  const envHttp = acceptProxyUrl(readEnv(env, 'http_proxy'), diagnostics)
  const envHttps = acceptProxyUrl(readEnv(env, 'https_proxy'), diagnostics)
  const httpProxy = resolveScheme(envHttp, allValue)
  const httpsProxy = resolveScheme(envHttps, allValue, httpProxy)
  if (httpProxy === undefined && httpsProxy === undefined) return { policy: DIRECT_POLICY, diagnostics }
  return {
    policy: {
      ...httpProxy === undefined ? {} : { httpProxy },
      ...httpsProxy === undefined ? {} : { httpsProxy },
      noProxy: withLoopback(readEnv(env, 'no_proxy')?.value),
      source: 'env',
    },
    diagnostics,
  }
}

export function proxyForUrl(policy, url) {
  const proxy = url.protocol === 'https:' ? policy.httpsProxy : url.protocol === 'http:' ? policy.httpProxy : undefined
  if (proxy === undefined) return undefined
  if (isLoopbackHost(url.hostname)) return undefined
  return bypassesProxy(policy.noProxy, url) ? undefined : proxy
}
